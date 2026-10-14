import "server-only";

/**
 * Admin order mutations (PROMPTS.md Phase 7 item 4). Every function here is called ONLY from
 * app/admin/orders/actions.ts, which does the Zod validation, the `requireStaffOrAdmin()` role
 * re-check, and the `writeAuditLog`/`revalidateTag` calls — this file is the DB-transaction layer
 * underneath, same split as lib/db/mutations/orders.ts (checkout) vs app/api/checkout/route.ts.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { auditLog, couponRedemptions, orders, orderItems, variants, products, collections } from "../schema";
import { validateStatusTransition } from "@/lib/commerce/order-status";
import { orderDeletability } from "@/lib/commerce/order-delete";
import type { OrderStatus } from "@/types/order";

export type TransitionResult =
  | { ok: true; from: OrderStatus; to: OrderStatus }
  | { ok: false; error: string };

/**
 * Compare-and-set status transition: validates the jump against the state machine, then updates
 * the row ONLY if its status still matches the `from` the caller observed (`WHERE status = from`)
 * — so a second staff member's concurrent transition (or a stale page) can never silently
 * overwrite a state it didn't actually observe. A mismatch here means someone else moved the
 * order first; the caller gets a clear error, not a corrupted state.
 */
export async function transitionOrderStatusDb(orderId: number, to: OrderStatus): Promise<TransitionResult> {
  const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) return { ok: false, error: "Order not found." };

  const verdict = validateStatusTransition(current.status, to);
  if (!verdict.ok) return { ok: false, error: verdict.error };

  const updated = await db
    .update(orders)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, current.status)))
    .returning({ id: orders.id });

  if (updated.length === 0) {
    return { ok: false, error: "This order's status changed since you loaded the page. Refresh and try again." };
  }
  return { ok: true, from: current.status, to };
}

/** Writes back a Shiprocket push result — mirrors lib/db/mutations/orders.ts's
 * `attachShiprocketOrderId`, kept as its own function here so the admin action layer doesn't
 * reach into the checkout mutation module for an unrelated write path. */
export async function attachShiprocketPushResultDb(orderId: number, shiprocketOrderId: string): Promise<void> {
  await db.update(orders).set({ shiprocketOrderId, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

export interface RecordRefundInput {
  orderId: number;
  amountPaise: number;
  note: string;
  razorpayRefundId: string | null;
}

/** Records a refund on the order regardless of whether the real Razorpay API call succeeded
 * (honest-degrade — CLAUDE.md's pattern for every third-party integration in this project).
 * Deliberately independent of the status state machine: a refund is a financial fact that can be
 * recorded against an order in any status; moving the order's `status` to "refunded" (when legal)
 * is a separate, explicit state-machine transition the staff member makes themselves. */
export async function recordRefundDb(input: RecordRefundInput): Promise<void> {
  await db
    .update(orders)
    .set({
      refundAmountPaise: input.amountPaise,
      refundNote: input.note,
      razorpayRefundId: input.razorpayRefundId,
      refundedAt: new Date(),
      paymentStatus: "refunded",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, input.orderId));
}

export async function addStaffNoteDb(orderId: number, note: string): Promise<{ before: string | null; after: string }> {
  const [row] = await db.select({ staffNote: orders.staffNote }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const before = row?.staffNote ?? null;
  const timestamp = new Date().toISOString();
  const after = before ? `${before}\n\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`;
  await db.update(orders).set({ staffNote: after, updatedAt: new Date() }).where(eq(orders.id, orderId));
  return { before, after };
}

export interface CancelOrderResult {
  ok: true;
  restoredVariantIds: number[];
  affectedProductSlugs: string[];
  affectedCollectionSlugs: string[];
}
export type CancelOrderOutcome = CancelOrderResult | { ok: false; error: string };

/**
 * Cancels an order and restores the stock decremented at checkout — the inverse of Phase 5's
 * decrement (lib/db/mutations/orders.ts#createOrderTransaction), in one real transaction so a
 * failure partway through leaves neither the status nor the stock changed. Returns the affected
 * product/collection slugs so the caller can `revalidateTag` every storefront page whose stock
 * display just changed (CLAUDE.md §3.4).
 */
export async function cancelOrderDb(orderId: number, reason: string): Promise<CancelOrderOutcome> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!current) return { ok: false, error: "Order not found." };

    const verdict = validateStatusTransition(current.status, "cancelled");
    if (!verdict.ok) return { ok: false, error: verdict.error };

    const updated = await tx
      .update(orders)
      .set({
        status: "cancelled",
        staffNote: sql`coalesce(${orders.staffNote} || E'\n\n', '') || ${`[${new Date().toISOString()}] Cancelled: ${reason}`}`,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, current.status)))
      .returning({ id: orders.id });

    if (updated.length === 0) {
      return { ok: false, error: "This order's status changed since you loaded the page. Refresh and try again." };
    }

    // Restore stock for variants that track a real count, same guarded UPDATE shape as
    // markOrderPaymentFailed (lib/db/mutations/orders.ts) — only variants with stock_qty IS NOT
    // NULL are touched at all; boolean-only variants are left alone (there's no count to restore).
    const restored = await tx.execute<{ variant_id: number }>(sql`
      UPDATE ${variants}
      SET stock_qty = stock_qty + oi.qty, in_stock = true
      FROM ${orderItems} oi
      WHERE ${variants}.id = oi.variant_id AND oi.order_id = ${orderId} AND ${variants}.stock_qty IS NOT NULL
      RETURNING ${variants}.id AS variant_id
    `);
    const restoredVariantIds = restored.rows.map((r) => r.variant_id);

    // Product/collection slugs for every line item, whether or not stock was actually restored
    // (a boolean-only in/out variant's `in_stock` flag doesn't change from a cancel, but the order
    // count itself did — revalidating is cheap and correctness here matters more than skipping a
    // no-op cache tag).
    const lineProductRows = await tx
      .select({ productSlug: products.slug, collectionSlug: collections.slug })
      .from(orderItems)
      .innerJoin(variants, eq(variants.id, orderItems.variantId))
      .innerJoin(products, eq(products.id, variants.productId))
      .innerJoin(collections, eq(collections.id, products.collectionId))
      .where(eq(orderItems.orderId, orderId));

    return {
      ok: true,
      restoredVariantIds,
      affectedProductSlugs: Array.from(new Set(lineProductRows.map((r) => r.productSlug))),
      affectedCollectionSlugs: Array.from(new Set(lineProductRows.map((r) => r.collectionSlug))),
    };
  });
}

export type DeleteOrderOutcome =
  | { ok: true; affectedProductSlugs: string[]; affectedCollectionSlugs: string[] }
  | { ok: false; error: string };

/**
 * Deletes an order that was never paid — an abandoned or failed checkout, a test — with its line
 * items and its audit entries (client request 2026-10-13). A paid order is a financial record
 * (GST invoice, payment, possible refund) and is never deletable: CLAUDE.md §9's rule stands for
 * those; cancel or refund it instead. Stock still reserved by a pending order is released first
 * (a failed or cancelled order already released its stock).
 */
export async function deleteUnpaidOrderDb(orderId: number): Promise<DeleteOrderOutcome> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        razorpayPaymentId: orders.razorpayPaymentId,
        shiprocketOrderId: orders.shiprocketOrderId,
        refundedAt: orders.refundedAt,
        razorpayOrderId: orders.razorpayOrderId,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) return { ok: false, error: "Order not found." };
    const deletability = orderDeletability(order);
    if (!deletability.deletable) return { ok: false, error: deletability.reason };

    // The storefront shows stock, so the products this order held stock for need refreshing.
    const lineProductRows = await tx
      .select({ productSlug: products.slug, collectionSlug: collections.slug })
      .from(orderItems)
      .innerJoin(variants, eq(variants.id, orderItems.variantId))
      .innerJoin(products, eq(products.id, variants.productId))
      .innerJoin(collections, eq(collections.id, products.collectionId))
      .where(eq(orderItems.orderId, orderId));
    const released = order.paymentStatus === "pending" && order.status === "pending";
    if (released) {
      await tx.execute(sql`
        UPDATE ${variants}
        SET stock_qty = stock_qty + oi.qty, in_stock = true
        FROM ${orderItems} oi
        WHERE ${variants}.id = oi.variant_id AND oi.order_id = ${orderId} AND ${variants}.stock_qty IS NOT NULL
      `);
    }
    await tx.delete(couponRedemptions).where(eq(couponRedemptions.orderId, orderId));
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await tx.delete(auditLog).where(and(eq(auditLog.entity, "order"), eq(auditLog.entityId, String(orderId))));
    await tx.delete(orders).where(eq(orders.id, orderId));
    return {
      ok: true,
      affectedProductSlugs: released ? Array.from(new Set(lineProductRows.map((r) => r.productSlug))) : [],
      affectedCollectionSlugs: released ? Array.from(new Set(lineProductRows.map((r) => r.collectionSlug))) : [],
    };
  });
}
