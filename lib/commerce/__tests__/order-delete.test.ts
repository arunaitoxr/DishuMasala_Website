import { describe, expect, it } from "vitest";
import { orderDeletability, PAYMENT_GRACE_HOURS, type DeletableOrderFields } from "@/lib/commerce/order-delete";

const placedAt = new Date("2026-10-10T10:00:00Z");
const base: DeletableOrderFields = {
  status: "pending",
  paymentStatus: "failed",
  razorpayOrderId: "order_abc",
  razorpayPaymentId: null,
  shiprocketOrderId: null,
  refundedAt: null,
  placedAt,
};
const hoursAfter = (h: number) => new Date(placedAt.getTime() + h * 3600_000);

describe("orderDeletability", () => {
  it("refuses a failed Razorpay checkout while a retried or slow payment could still be captured", () => {
    const result = orderDeletability(base, hoursAfter(1));
    expect(result.deletable).toBe(false);
  });

  it("allows it once the grace period has passed", () => {
    expect(orderDeletability(base, hoursAfter(PAYMENT_GRACE_HOURS + 1)).deletable).toBe(true);
  });

  it("allows a never-paid order with no Razorpay order straight away", () => {
    expect(orderDeletability({ ...base, razorpayOrderId: null }, hoursAfter(0)).deletable).toBe(true);
  });

  it("never allows a paid, refunded, shipped or confirmed order", () => {
    const late = hoursAfter(PAYMENT_GRACE_HOURS * 10);
    expect(orderDeletability({ ...base, paymentStatus: "paid" }, late).deletable).toBe(false);
    expect(orderDeletability({ ...base, paymentStatus: "refunded" }, late).deletable).toBe(false);
    expect(orderDeletability({ ...base, razorpayPaymentId: "pay_1" }, late).deletable).toBe(false);
    expect(orderDeletability({ ...base, shiprocketOrderId: "sr_1" }, late).deletable).toBe(false);
    expect(orderDeletability({ ...base, status: "confirmed" }, late).deletable).toBe(false);
    expect(orderDeletability({ ...base, refundedAt: late }, late).deletable).toBe(false);
  });
});
