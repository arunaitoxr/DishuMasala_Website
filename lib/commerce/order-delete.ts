/**
 * When an order may be deleted (client request 2026-10-13, CLAUDE.md §9's amendment): only an
 * order that was never paid — an abandoned or failed checkout. One rule shared by the admin list,
 * the order page and the delete mutation, so the button never shows for an order the server
 * refuses.
 *
 * A Razorpay checkout is not "never paid" the moment it fails: the shopper can retry inside the
 * same Razorpay order, and a slow UPI payment can be captured minutes or hours later. Deleting the
 * order in that window would leave a captured payment with no order (the webhook finds nothing to
 * mark paid), so an order with a Razorpay order attached is deletable only once it is
 * `PAYMENT_GRACE_HOURS` old.
 */
export const PAYMENT_GRACE_HOURS = 72;

export interface DeletableOrderFields {
  status: string;
  paymentStatus: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  shiprocketOrderId: string | null;
  refundedAt: Date | null;
  placedAt: Date;
}

export type OrderDeletability = { deletable: true } | { deletable: false; reason: string; after?: Date };

export function orderDeletability(order: DeletableOrderFields, now: Date = new Date()): OrderDeletability {
  const neverPaid =
    (order.paymentStatus === "pending" || order.paymentStatus === "failed") &&
    !order.razorpayPaymentId &&
    !order.refundedAt &&
    !order.shiprocketOrderId &&
    (order.status === "pending" || order.status === "cancelled");
  if (!neverPaid) return { deletable: false, reason: "Only orders that were never paid can be deleted. Cancel or refund this one instead." };

  if (order.razorpayOrderId) {
    const after = new Date(order.placedAt.getTime() + PAYMENT_GRACE_HOURS * 3600_000);
    if (now < after) {
      return {
        deletable: false,
        after,
        reason: `A payment can still arrive for this checkout for ${PAYMENT_GRACE_HOURS} hours after it was placed, so it can't be deleted yet.`,
      };
    }
  }
  return { deletable: true };
}
