import { NextResponse } from "next/server";
import { z } from "zod";
import { computePricing } from "@/lib/commerce/pricing";
import { defaultPricingDeps } from "@/lib/commerce/pricing-deps";
import { addressSchema } from "@/lib/commerce/address";
import { createOrderTransaction, attachRazorpayOrderId, markOrderPaymentFailed } from "@/lib/db/mutations/orders";
import { getOrderByIdempotencyKey, getOrderById } from "@/lib/db/queries/orders";
import { getRazorpayClient } from "@/lib/razorpay/client";
import { buildOrderConfirmationUrl } from "@/lib/order-token";
import { getSessionUser } from "@/lib/auth/session";

function confirmationUrlFor(orderNumber: string, email: string): string {
  return buildOrderConfirmationUrl(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000", orderNumber, email);
}

/**
 * The integrity gate (CLAUDE.md §7.5 / PROMPTS.md Phase 5 item 6), executed in this exact order:
 *
 *   1. Zod-validate the request.
 *   2. Recompute everything server-side via lib/commerce/pricing.ts.
 *   3. Compare the server total against the client-submitted total; a mismatch (or anything else
 *      pricing.ts had to correct — stock, a rejected coupon) is rejected with the corrected cart,
 *      never silently accepted and never silently charged at the higher number either.
 *   4. Open one real DB transaction: insert the order + item snapshots, decrement stock, increment
 *      coupon usage. Commit.
 *   5. Only after commit: for a prepaid order, create the Razorpay order for the SERVER total; for
 *      (Cash on delivery was removed 2026-09-20 — every order is prepaid.)
 *
 * Idempotency: `idempotencyKey` is required and enforced by a real unique DB constraint
 * (orders.idempotency_key) — see lib/db/mutations/orders.ts#createOrderTransaction for how a
 * concurrent duplicate is resolved to the same order row rather than erroring or duplicating.
 */

// `isGift` must round-trip the same way it does for /api/cart/validate (CLAUDE.md §7.5): without
// it, a genuine free-gift line arrives here indistinguishable from an ordinary paid one, gets
// priced at full cost by computePricing, and its total will never match what the client displayed
// — rejecting every order that has a gift in it as a false "price mismatch"/"cart changed".
const lineSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().positive().max(99),
  isGift: z.boolean().optional(),
});

const checkoutSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  email: z.string().trim().email().max(200),
  lines: z.array(lineSchema).min(1).max(50),
  couponCode: z.string().trim().max(40).optional().nullable(),
  // Prepaid only — cash on delivery was removed (client, 2026-09-20), so a "cod" request is invalid.
  paymentMethod: z.literal("razorpay"),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional().nullable(),
  customerNote: z.string().trim().max(500).optional().nullable(),
  /** The total the client's own UI is currently displaying — compared against the server's
   * independently recomputed total, never trusted as the charge amount itself. */
  clientTotalPaise: z.number().int().nonnegative(),
});

type CheckoutError =
  | { code: "invalid_input"; message: string }
  | { code: "price_mismatch"; message: string; correctedCart: Awaited<ReturnType<typeof computePricing>> }
  | { code: "cart_changed"; message: string; correctedCart: Awaited<ReturnType<typeof computePricing>> }
  | { code: "empty_cart"; message: string }
  | { code: "payment_unavailable"; message: string }
  | { code: "internal_error"; message: string };

function errorResponse(status: number, error: CheckoutError): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, { code: "invalid_input", message: "Request body must be JSON." });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, { code: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid checkout request." });
  }
  const input = parsed.data;

  try {
    // Idempotent replay: an identical earlier request already produced an order for this key —
    // hand back that same order rather than re-running checkout (the network-retry / double-click
    // case). The DB unique constraint (see createOrderTransaction) is what closes the remaining
    // race where two requests for the same key are genuinely concurrent.
    const existing = await getOrderByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return NextResponse.json({
        ok: true,
        replayed: true,
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        paymentMethod: existing.paymentMethod,
        razorpayOrderId: existing.razorpayOrderId,
        totalPaise: existing.totalPaise,
        confirmationUrl: confirmationUrlFor(existing.orderNumber, existing.email),
      });
    }

    const pricing = await computePricing(
      { lines: input.lines, couponCode: input.couponCode, email: input.email },
      defaultPricingDeps,
    );

    if (!pricing.clean) {
      return errorResponse(409, {
        code: "cart_changed",
        message: "Some items in your cart changed — please review the corrected cart before continuing.",
        correctedCart: pricing,
      });
    }
    if (pricing.totalPaise !== input.clientTotalPaise) {
      return errorResponse(409, {
        code: "price_mismatch",
        message: "The price shown didn't match our records — please review the corrected total before continuing.",
        correctedCart: pricing,
      });
    }

    // Attaches the order to the signed-in shopper when a session exists (PROMPTS.md Phase 6 —
    // previously always null, since accounts didn't exist yet) so /account/orders has real data.
    // Guest checkout stays fully supported: no session simply means userId stays null, exactly
    // like every order before this phase.
    const sessionUser = await getSessionUser();

    const createResult = await createOrderTransaction({
      idempotencyKey: input.idempotencyKey,
      email: input.email,
      phone: input.shippingAddress.phone,
      paymentMethod: input.paymentMethod,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? null,
      customerNote: input.customerNote ?? null,
      pricing,
      userId: sessionUser?.id ?? null,
    });

    if (!createResult.ok) {
      if (createResult.error === "empty_cart") {
        return errorResponse(400, { code: "empty_cart", message: "Your cart is empty." });
      }
      // stock_conflict: someone else bought the remaining stock between our pricing read and the
      // transaction's locked write. Recompute fresh and return the corrected cart, same shape as
      // any other correction — the client re-confirms rather than being silently charged.
      const corrected = await computePricing(
        { lines: input.lines, couponCode: input.couponCode, email: input.email },
        defaultPricingDeps,
      );
      return errorResponse(409, {
        code: "cart_changed",
        message: "One of the items just sold out — please review the corrected cart before continuing.",
        correctedCart: corrected,
      });
    }

    if (createResult.replayed) {
      const order = await getOrderById(createResult.orderId);
      return NextResponse.json({
        ok: true,
        replayed: true,
        orderId: createResult.orderId,
        orderNumber: createResult.orderNumber,
        paymentMethod: order?.paymentMethod ?? input.paymentMethod,
        razorpayOrderId: order?.razorpayOrderId ?? null,
        totalPaise: order?.totalPaise ?? pricing.totalPaise,
        confirmationUrl: confirmationUrlFor(createResult.orderNumber, input.email),
      });
    }

    // Prepaid: create the Razorpay order for the SERVER-computed total, after commit.
    const client = getRazorpayClient();
    if (!client) {
      await markOrderPaymentFailed(createResult.orderId);
      return errorResponse(503, {
        code: "payment_unavailable",
        message: "Online payments are temporarily unavailable. Please try again in a little while.",
      });
    }

    try {
      const razorpayOrder = await client.createOrder({
        amountPaise: pricing.totalPaise,
        receipt: createResult.orderNumber,
        notes: { order_number: createResult.orderNumber },
      });
      await attachRazorpayOrderId(createResult.orderId, razorpayOrder.id);
      return NextResponse.json({
        ok: true,
        replayed: false,
        orderId: createResult.orderId,
        orderNumber: createResult.orderNumber,
        paymentMethod: "razorpay" as const,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: client.keyId,
        totalPaise: pricing.totalPaise,
        confirmationUrl: confirmationUrlFor(createResult.orderNumber, input.email),
      });
    } catch {
      await markOrderPaymentFailed(createResult.orderId);
      return errorResponse(503, {
        code: "payment_unavailable",
        message: "We couldn't start your payment right now. Please try again.",
      });
    }
  } catch (err) {
    // Logged server-side only — never a raw stack trace to the client (CLAUDE.md §12).
    console.error("[checkout] unhandled error", err);
    return errorResponse(500, { code: "internal_error", message: "Something went wrong placing your order. Please try again." });
  }
}
