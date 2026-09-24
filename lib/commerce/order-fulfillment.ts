import "server-only";

/**
 * What happens once an order is genuinely confirmed — for COD, that's immediately at checkout;
 * for a Razorpay order, that's the payment transition in `markOrderPaid`. Shared by
 * app/api/checkout/route.ts (COD path), app/api/payment/verify/route.ts and
 * app/api/payment/webhook/route.ts so the "send the confirmation email, push to Shiprocket" side
 * effects live in exactly one place rather than being re-implemented per route and drifting.
 *
 * Every call here happens strictly after its caller's DB write has already committed — never from
 * inside a `db.transaction(...)` block (CLAUDE.md: email/Shiprocket must never sit inside the
 * order-insert transaction).
 */
import { markOrderPaid, markOrderPaymentFailed, attachShiprocketOrderId } from "@/lib/db/mutations/orders";
import { getOrderById } from "@/lib/db/queries/orders";
import { getStoreAddress } from "@/lib/db/queries/settings";
import { pushOrderToShiprocket } from "@/lib/shiprocket";
import { sendOrderConfirmationEmail, sendNewOrderStaffEmail } from "@/lib/email";
import { sendOrderConfirmationWhatsApp } from "@/lib/whatsapp";
import { buildOrderConfirmationUrl } from "@/lib/order-token";
import { formatINR } from "@/lib/money";
import type { Order } from "@/types/order";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

/** Best-effort staff notification — never lets a bad/missing store email block the customer-facing
 * side effects below. `"TODO"` is the literal seeded placeholder (lib/db/queries/settings.ts)
 * before the client has supplied a real address; skip rather than "send" to a fake inbox. */
async function notifyStaffOfNewOrder(order: Order): Promise<void> {
  const storeAddress = await getStoreAddress();
  const to = storeAddress?.email;
  if (!to || to === "TODO") {
    console.warn(`[email] no store notification email configured (settings.store_address.email) — skipping new-order alert for ${order.orderNumber}`);
    return;
  }
  const adminOrderUrl = `${siteUrl()}/admin/orders/${order.orderNumber}`;
  await sendNewOrderStaffEmail(to, order, adminOrderUrl);
}

/** Sends the order-confirmation email and attempts the Shiprocket push for an order that is now
 * genuinely confirmed. Never throws — a Shiprocket outage must never surface as a checkout/payment
 * failure (CLAUDE.md §7.2); the push is simply left "needs retry" (lib/shiprocket.ts). */
export async function runOrderConfirmedSideEffects(order: Order): Promise<void> {
  const confirmationUrl = buildOrderConfirmationUrl(siteUrl(), order.orderNumber, order.email);
  await sendOrderConfirmationEmail(order, confirmationUrl);
  await notifyStaffOfNewOrder(order);
  // Never blocks/throws — see lib/whatsapp.ts's own degrade-honestly contract, same as email above.
  await sendOrderConfirmationWhatsApp({
    phone: order.phone,
    customerName: order.shippingAddress.name,
    orderNumber: order.orderNumber,
    totalFormatted: formatINR(order.totalPaise),
  });

  const push = await pushOrderToShiprocket({
    orderNumber: order.orderNumber,
    orderDateIso: order.placedAt.toISOString(),
    email: order.email,
    phone: order.phone,
    shippingAddress: {
      name: order.shippingAddress.name,
      line1: order.shippingAddress.line1,
      line2: order.shippingAddress.line2,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      pincode: order.shippingAddress.pincode,
    },
    items: order.items.map((item) => ({
      name: item.productName,
      sku: item.sku,
      units: item.qty,
      sellingPriceRupees: item.unitPricePaise / 100,
    })),
    subtotalRupees: order.subtotalPaise / 100,
    paymentMethod: order.paymentMethod,
  });
  if (push.status === "pushed") {
    await attachShiprocketOrderId(order.id, push.shiprocketOrderId);
  }
}

export type FinalizePaymentResult = { ok: true; alreadyPaid: boolean } | { ok: false; error: "not_found" | "payment_id_conflict" };

/**
 * The single entry point both the client-side verify route and the async webhook call to mark a
 * Razorpay order paid (CLAUDE.md §7.5: the webhook is the source of truth, verify is a fast-path
 * UX improvement — but both must be able to safely finish the job). `markOrderPaid`'s
 * compare-and-set guard is what makes calling this twice for the same order safe: whichever
 * caller wins the race runs the side effects exactly once; the loser sees `alreadyPaid: true` and
 * does nothing further.
 */
export async function finalizeOrderPayment(orderId: number, razorpayPaymentId: string): Promise<FinalizePaymentResult> {
  const result = await markOrderPaid(orderId, razorpayPaymentId);
  if (!result.ok) return result;
  if (result.alreadyPaid) return { ok: true, alreadyPaid: true };

  const order = await getOrderById(orderId);
  if (order) await runOrderConfirmedSideEffects(order);
  return { ok: true, alreadyPaid: false };
}

/** On payment failure: releases reserved stock (CLAUDE.md §7.5). Guarded the same
 * compare-and-set way, so a duplicate failure notification is a safe no-op. */
export async function finalizeOrderFailure(orderId: number): Promise<{ ok: boolean }> {
  const result = await markOrderPaymentFailed(orderId);
  return { ok: result.ok };
}
