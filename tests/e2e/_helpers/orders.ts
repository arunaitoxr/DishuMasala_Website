import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

/** Coriander Powder 100 gm — a published, in-stock variant in the live-copied catalogue. Override with
 * E2E_VARIANT_ID if the catalogue changes. */
export const E2E_VARIANT_ID = Number(process.env.E2E_VARIANT_ID ?? 29);

/**
 * Creates a real, PAID order through the app's own checkout and payment-verify routes, with only the
 * Razorpay network call replaced by the dev-only mock (app/api/testing/razorpay-mock, 404 in
 * production). Cash on delivery no longer exists (every order is prepaid), so admin specs that need an
 * order to walk through the fulfilment states use this instead of a COD order.
 */
export async function createPaidOrder(request: APIRequestContext, email = `admin-e2e-${randomUUID().slice(0, 8)}@example.com`): Promise<string> {
  const lines = [{ variantId: E2E_VARIANT_ID, qty: 1 }];
  await request.post("/api/testing/razorpay-mock", { data: { action: "arm" } });
  try {
    const pricing = await (await request.post("/api/cart/validate", { data: { lines, email } })).json();
    const checkout = await (
      await request.post("/api/checkout", {
        data: {
          idempotencyKey: randomUUID(),
          email,
          lines,
          paymentMethod: "razorpay",
          shippingAddress: { name: "Admin E2E Shopper", phone: "9876543210", line1: "1 Test Lane", city: "Sangrur", state: "Punjab", pincode: "148001" },
          customerNote: null,
          clientTotalPaise: pricing.pricing.totalPaise,
        },
      })
    ).json();
    if (!checkout.ok) throw new Error(`Checkout failed: ${JSON.stringify(checkout)}`);

    const captured = await (await request.post("/api/testing/razorpay-mock", { data: { action: "capture", orderId: checkout.razorpayOrderId } })).json();
    const verified = await (
      await request.post("/api/payment/verify", {
        data: { razorpayOrderId: checkout.razorpayOrderId, razorpayPaymentId: captured.paymentId, razorpaySignature: captured.signature },
      })
    ).json();
    if (!verified.ok) throw new Error(`Payment verify failed: ${JSON.stringify(verified)}`);
    return checkout.orderNumber as string;
  } finally {
    await request.post("/api/testing/razorpay-mock", { data: { action: "disarm" } });
  }
}
