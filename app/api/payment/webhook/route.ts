import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay/signature";
import { getOrderByRazorpayOrderId } from "@/lib/db/queries/orders";
import { finalizeOrderFailure, finalizeOrderPayment } from "@/lib/commerce/order-fulfillment";

/**
 * Razorpay's server-to-server webhook (PROMPTS.md Phase 5 item 7) — the source of truth for
 * payment state (CLAUDE.md §4/§7.5), independent of whether the shopper's browser ever reaches
 * `app/api/payment/verify/route.ts` at all (they might close the tab right after paying). Signed
 * with a SEPARATE secret (`RAZORPAY_WEBHOOK_SECRET`) from the checkout HMAC, over the raw request
 * body — verified here before the body is even parsed as JSON.
 *
 * Idempotency: `finalizeOrderPayment`/`finalizeOrderFailure` both perform a compare-and-set DB
 * update guarded on the order's current `payment_status` (lib/db/mutations/orders.ts) — so this
 * handler can safely run for the exact same event delivered twice (Razorpay's own retry policy)
 * or race with a concurrent call from the verify route, and only the first to actually land
 * performs the state transition and its side effects; every later call is a safe no-op.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: { code: "not_configured", message: "Webhook not configured." } }, { status: 503 });
  }

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ ok: false, error: { code: "invalid_signature", message: "Invalid webhook signature." } }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "Malformed payload." } }, { status: 400 });
  }

  const event = extractString(payload, ["event"]);
  const razorpayOrderId = extractString(payload, ["payload", "payment", "entity", "order_id"]);
  const razorpayPaymentId = extractString(payload, ["payload", "payment", "entity", "id"]);

  if (!event || !razorpayOrderId || !razorpayPaymentId) {
    // Acknowledge (2xx) rather than making Razorpay retry a payload that will never parse better.
    return NextResponse.json({ ok: true, ignored: "missing_fields" });
  }

  try {
    const order = await getOrderByRazorpayOrderId(razorpayOrderId);
    if (!order) {
      // A captured payment with no order means money taken with nothing to ship — it must be
      // refunded by hand from the Razorpay dashboard, so log it loudly enough to find.
      const log = event === "payment.captured" ? console.error : console.warn;
      log(`[razorpay webhook] ${event} for unknown razorpay_order_id=${razorpayOrderId} payment=${razorpayPaymentId}${event === "payment.captured" ? " — CAPTURED WITH NO ORDER, refund it in Razorpay" : ""}`);
      return NextResponse.json({ ok: true, ignored: "order_not_found" });
    }

    if (event === "payment.captured") {
      await finalizeOrderPayment(order.id, razorpayPaymentId);
    } else if (event === "payment.failed") {
      await finalizeOrderFailure(order.id);
    }
    // Any other event type is acknowledged and otherwise ignored — this webhook only needs to
    // react to capture/failure per the current scope (CLAUDE.md §7.1).

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[payment/webhook] unhandled error", err);
    return NextResponse.json({ ok: false, error: { code: "internal_error", message: "Webhook processing failed." } }, { status: 500 });
  }
}

/** Reads a nested string field out of an untyped JSON payload without ever throwing. */
function extractString(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null || !(key in cur)) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : null;
}
