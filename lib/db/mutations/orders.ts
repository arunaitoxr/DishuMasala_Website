import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { coupons, couponRedemptions, orderItems, orders, variants } from "../schema";
import { nextOrderNumber } from "../order-number";
import type { PricingResult } from "@/lib/commerce/pricing";
import type { OrderAddress } from "@/types/order";

/** Postgres unique-violation error code (23505) — used to detect a concurrent double-submit
 * racing on `orders_idempotency_key_uniq` or `orders_razorpay_payment_id_uniq`. Drizzle wraps the
 * underlying `pg` error in its own `Error` with the real driver error attached as `.cause`, so
 * both the top-level and the `.cause` object are checked for the code. */
function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

export interface CreateOrderInput {
  idempotencyKey: string;
  email: string;
  phone: string;
  paymentMethod: "razorpay" | "cod";
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress | null;
  customerNote: string | null;
  pricing: PricingResult;
  /** The signed-in shopper's id, when checkout happens with a session (PROMPTS.md Phase 6 —
   * previously always null since accounts didn't exist yet). Still nullable: guest checkout is
   * explicitly allowed (CLAUDE.md §9 / PRD §5.4) and stays so even now that accounts exist. */
  userId: number | null;
}

export type CreateOrderResult =
  | { ok: true; orderId: number; orderNumber: string; replayed: false }
  /** A second, concurrent (or retried) request with the same idempotency key landed after the
   * first had already committed — the existing order is returned instead of creating a duplicate. */
  | { ok: true; orderId: number; orderNumber: string; replayed: true }
  | { ok: false; error: "empty_cart" }
  | { ok: false; error: "stock_conflict"; variantId: number };

/**
 * The integrity-critical transaction (CLAUDE.md §7.5): order insert + item snapshots + stock
 * decrement, all inside one real Postgres transaction (lib/db/index.ts's header comment explains
 * why a pooled driver is required for this). Any failure partway through — a stock conflict, a DB
 * error — rolls back everything: no order and no stock change survives. A coupon is not counted
 * here: an order is still `pending` at this point, and coupon usage is recorded only once the
 * payment is confirmed (`markOrderPaid`).
 *
 * Idempotency is enforced at the database level via the unique index on `idempotency_key`
 * (CLAUDE.md §7.5's "double-submit cannot create two orders"), not merely a client-side debounce:
 * two concurrent requests carrying the same key can both reach this function; only one INSERT
 * wins, the other hits a unique-violation which is caught and resolved by returning the row the
 * winner created — so the caller always gets back *a* real order, and exactly one order row ever
 * exists for that key.
 */
export async function createOrderTransaction(input: CreateOrderInput): Promise<CreateOrderResult> {
  const lines = input.pricing.lines;
  if (lines.length === 0) return { ok: false, error: "empty_cart" };

  try {
    return await db.transaction(async (tx) => {
      const orderNumber = await nextOrderNumber();

      const initialStatus = input.paymentMethod === "cod" ? "confirmed" : "pending";
      const initialPaymentStatus = "pending" as const;

      const [orderRow] = await tx
        .insert(orders)
        .values({
          orderNumber,
          idempotencyKey: input.idempotencyKey,
          userId: input.userId,
          email: input.email,
          phone: input.phone,
          status: initialStatus,
          paymentMethod: input.paymentMethod,
          paymentStatus: initialPaymentStatus,
          subtotalPaise: input.pricing.subtotalPaise,
          discountPaise: input.pricing.discountPaise,
          bundleDiscountPaise: input.pricing.crossPillarDiscountPaise,
          shippingPaise: input.pricing.shippingPaise,
          totalPaise: input.pricing.totalPaise,
          couponCode: input.pricing.couponCode,
          shippingAddress: input.shippingAddress,
          billingAddress: input.billingAddress,
          customerNote: input.customerNote,
        })
        .returning({ id: orders.id });

      // Stock decrement — locked read (`FOR UPDATE`) then a guarded write, all inside this same
      // transaction, so a second concurrent checkout for the same variant blocks on the lock
      // rather than racing: only variants that track a real count (`stock_qty` non-null,
      // CLAUDE.md §7.6) are touched at all; a null-stockQty (boolean-only) variant is left
      // untouched, there is no count to decrement. Insufficient stock at this point throws and
      // rolls back the whole transaction rather than oversell.
      for (const line of lines) {
        const [locked] = await tx
          .select({ stockQty: variants.stockQty })
          .from(variants)
          .where(eq(variants.id, line.variantId))
          .for("update");

        if (locked?.stockQty != null) {
          if (locked.stockQty < line.qty) throw new StockConflictError(line.variantId);
          await tx
            .update(variants)
            .set({ stockQty: locked.stockQty - line.qty, inStock: locked.stockQty - line.qty > 0 })
            .where(eq(variants.id, line.variantId));
        }
      }

      await tx.insert(orderItems).values(
        lines.map((line) => ({
          orderId: orderRow.id,
          variantId: line.variantId,
          productName: line.productName,
          optionValue: line.optionValue,
          sku: line.sku,
          mrpPaise: line.mrpPaise,
          unitPricePaise: line.unitPricePaise,
          qty: line.qty,
          lineTotalPaise: line.lineTotalPaise,
          imageStorageKey: line.imageStorageKey,
        })),
      );

      return { ok: true as const, orderId: orderRow.id, orderNumber, replayed: false as const };
    });
  } catch (err) {
    if (err instanceof StockConflictError) {
      return { ok: false, error: "stock_conflict", variantId: err.variantId };
    }
    if (isUniqueViolation(err)) {
      const existing = await db.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing[0]) {
        return { ok: true, orderId: existing[0].id, orderNumber: existing[0].orderNumber, replayed: true };
      }
    }
    throw err;
  }
}

class StockConflictError extends Error {
  constructor(public variantId: number) {
    super(`Insufficient stock for variant ${variantId}`);
  }
}

/** Attaches the Razorpay order id created just after commit (CLAUDE.md's transaction boundary:
 * the Razorpay API call itself must never happen inside the DB transaction). */
export async function attachRazorpayOrderId(orderId: number, razorpayOrderId: string): Promise<void> {
  await db.update(orders).set({ razorpayOrderId, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

export type MarkPaidResult = { ok: true; alreadyPaid: boolean } | { ok: false; error: "not_found" | "payment_id_conflict" };

/**
 * Marks an order paid — a compare-and-set UPDATE guarded by `payment_status <> 'paid'`, so this
 * function is safe to call twice (or concurrently) for the same order: whichever caller — the
 * client-side verify route or the async webhook — gets there first performs the transition; the
 * other sees `alreadyPaid: true` and does nothing further. This is exactly the "arrives before,
 * after, or interleaved with the client callback" race CLAUDE.md §7.5 calls out, handled without
 * an explicit lock by relying on Postgres's own row-level atomicity for the single UPDATE.
 *
 * The same transition is where a coupon use is counted — once, by whichever caller wins — so
 * `coupons.used_count` is the number of paid orders that used the code. Signed-in shoppers also get
 * a `coupon_redemptions` row (its `user_id` is not nullable); guests are counted from `orders` by
 * email (lib/db/queries/coupons.ts).
 */
export async function markOrderPaid(orderId: number, razorpayPaymentId: string): Promise<MarkPaidResult> {
  try {
    return await db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: "confirmed", paymentStatus: "paid", razorpayPaymentId, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), sql`${orders.paymentStatus} <> 'paid'`))
        .returning({ id: orders.id, couponCode: orders.couponCode, userId: orders.userId });

      if (updated.length > 0) {
        const { couponCode, userId } = updated[0];
        if (couponCode) {
          const [couponRow] = await tx
            .update(coupons)
            .set({ usedCount: sql`${coupons.usedCount} + 1` })
            .where(eq(coupons.code, couponCode))
            .returning({ id: coupons.id });
          if (couponRow && userId != null) {
            await tx.insert(couponRedemptions).values({ couponId: couponRow.id, orderId, userId });
          }
        }
        return { ok: true as const, alreadyPaid: false };
      }

      const [existing] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!existing) return { ok: false as const, error: "not_found" as const };
      // Already paid (by the other racing caller) — idempotent no-op, not an error.
      return { ok: true as const, alreadyPaid: true };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Someone else's order already claimed this exact razorpay_payment_id — should be
      // impossible in practice (payment ids are unique to one order) but never silently corrupt
      // state if it somehow happens.
      return { ok: false, error: "payment_id_conflict" };
    }
    throw err;
  }
}

/**
 * On payment failure: marks the order's payment failed and releases whatever stock checkout
 * reserved for it (CLAUDE.md §7.5 / PROMPTS.md Phase 5 item 7). Guarded the same way as
 * `markOrderPaid` — `payment_status NOT IN ('paid','failed')` — so a duplicate failure webhook (or
 * one arriving after the order was already separately confirmed paid) can never release stock
 * twice or fail an already-successful order.
 */
export async function markOrderPaymentFailed(orderId: number): Promise<{ ok: true; released: boolean } | { ok: false; error: "not_found" }> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ paymentStatus: "failed", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), sql`${orders.paymentStatus} NOT IN ('paid', 'failed')`))
      .returning({ id: orders.id });

    if (updated.length === 0) {
      const [existing] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!existing) return { ok: false, error: "not_found" as const };
      return { ok: true as const, released: false }; // already paid or already failed — no-op
    }

    // Restore stock only for variants that were actually decremented at checkout (those tracking
    // a real count — stock_qty IS NOT NULL). One set-based UPDATE via a correlated subquery, not
    // a per-item round trip.
    await tx.execute(sql`
      UPDATE ${variants}
      SET stock_qty = stock_qty + oi.qty, in_stock = true
      FROM ${orderItems} oi
      WHERE ${variants}.id = oi.variant_id AND oi.order_id = ${orderId} AND ${variants}.stock_qty IS NOT NULL
    `);

    return { ok: true as const, released: true };
  });
}

/** Writes back a successful Shiprocket push (lib/shiprocket.ts#pushOrderToShiprocket). Left
 * uncalled on a `needs_retry` result — the order's `shiprocket_order_id` simply stays null, which
 * is itself the "outstanding, needs retry" signal (see that function's doc comment). */
export async function attachShiprocketOrderId(orderId: number, shiprocketOrderId: string): Promise<void> {
  await db.update(orders).set({ shiprocketOrderId, updatedAt: new Date() }).where(eq(orders.id, orderId));
}
