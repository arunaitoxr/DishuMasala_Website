"use server";

/**
 * Every order mutation in Phase 7 (CLAUDE.md §9 / PROMPTS.md Phase 7 item 5): Zod-validated
 * input, `requireStaffOrAdmin()` re-checked independently of middleware.ts, an `audit_log` row via
 * `lib/audit.ts`, `revalidateTag`/`revalidatePath` for anything the change could affect on the
 * storefront, and a typed result — never a raw throw to the client.
 *
 * The role check happens FIRST in every action, before any Zod parse or DB read, so a
 * customer-role session calling one of these directly (bypassing the page entirely) is rejected
 * before it can observe or change anything — the exact case PROMPTS.md's acceptance criterion and
 * tests/e2e/admin-order-actions... unit test below exercise.
 */
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { getOrderById } from "@/lib/db/queries/orders";
import {
  transitionOrderStatusDb,
  attachShiprocketPushResultDb,
  recordRefundDb,
  addStaffNoteDb,
  cancelOrderDb,
  deleteUnpaidOrderDb,
} from "@/lib/db/mutations/admin-orders";
import { pushOrderToShiprocket } from "@/lib/shiprocket";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { buildOrderConfirmationUrl } from "@/lib/order-token";
import { getRazorpayRefundClient } from "@/lib/razorpay/refund";
import { ALL_ORDER_STATUSES } from "@/lib/commerce/order-status";

export type AdminActionResult = { ok: true; message: string } | { ok: false; error: string };

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

async function revalidateOrder(orderNumber: string): Promise<void> {
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------------------------
// Status transition
// ---------------------------------------------------------------------------------------------

const transitionSchema = z.object({
  orderId: z.number().int().positive(),
  to: z.enum(ALL_ORDER_STATUSES),
});

/**
 * The server-side state-machine gate — enforced here regardless of what the UI happened to offer.
 * A direct call with an illegal jump (e.g. pending -> delivered) is rejected with a clear error,
 * proven independently in tests/unit/admin-order-status.test.ts.
 */
export async function transitionOrderStatusAction(input: z.infer<typeof transitionSchema>): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };

  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const order = await getOrderById(parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const result = await transitionOrderStatusDb(parsed.data.orderId, parsed.data.to);
  if (!result.ok) return { ok: false, error: result.error };

  await writeAuditLog({
    actorUserId: session.user.id,
    action: "order.status_transition",
    entity: "order",
    entityId: order.id,
    diff: { orderNumber: order.orderNumber, status: { from: result.from, to: result.to } },
  });
  await revalidateOrder(order.orderNumber);
  return { ok: true, message: `Order moved to "${result.to}".` };
}

// ---------------------------------------------------------------------------------------------
// Shiprocket dispatch / retry
// ---------------------------------------------------------------------------------------------

const orderIdSchema = z.object({ orderId: z.number().int().positive() });

async function dispatchOrShiprocketRetry(
  input: z.infer<typeof orderIdSchema>,
  action: "order.dispatch" | "order.dispatch_retry",
): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };

  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const order = await getOrderById(parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const result = await pushOrderToShiprocket({
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
    items: order.items.map((i) => ({
      name: i.productName,
      sku: i.sku,
      units: i.qty,
      sellingPriceRupees: i.unitPricePaise / 100,
    })),
    subtotalRupees: order.subtotalPaise / 100,
    paymentMethod: order.paymentMethod,
  });

  if (result.status === "needs_retry") {
    await writeAuditLog({
      actorUserId: session.user.id,
      action,
      entity: "order",
      entityId: order.id,
      diff: { orderNumber: order.orderNumber, result: "needs_retry", reason: result.reason },
    });
    await revalidateOrder(order.orderNumber);
    const reason =
      result.reason === "not_configured"
        ? "Shiprocket isn't configured in this environment (no SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD, or no real pickup pincode). No AWB was created — this is the honest degraded state, never a fake one."
        : "Shiprocket couldn't be reached right now. No AWB was created. This order is marked as needing a retry.";
    return { ok: false, error: reason };
  }

  await attachShiprocketPushResultDb(order.id, result.shiprocketOrderId);
  await writeAuditLog({
    actorUserId: session.user.id,
    action,
    entity: "order",
    entityId: order.id,
    diff: { orderNumber: order.orderNumber, result: "pushed", shiprocketOrderId: { from: order.shiprocketOrderId, to: result.shiprocketOrderId } },
  });
  await revalidateOrder(order.orderNumber);
  return { ok: true, message: `Pushed to Shiprocket (order ${result.shiprocketOrderId}). AWB assignment happens in a later Shiprocket step, once a courier is picked there.` };
}

export async function dispatchOrderAction(input: z.infer<typeof orderIdSchema>): Promise<AdminActionResult> {
  return dispatchOrShiprocketRetry(input, "order.dispatch");
}

export async function retryShiprocketPushAction(input: z.infer<typeof orderIdSchema>): Promise<AdminActionResult> {
  return dispatchOrShiprocketRetry(input, "order.dispatch_retry");
}

// ---------------------------------------------------------------------------------------------
// Resend confirmation email
// ---------------------------------------------------------------------------------------------

export async function resendConfirmationEmailAction(input: z.infer<typeof orderIdSchema>): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };

  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const order = await getOrderById(parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const confirmationUrl = buildOrderConfirmationUrl(siteUrl(), order.orderNumber, order.email);
  const result = await sendOrderConfirmationEmail(order, confirmationUrl);

  await writeAuditLog({
    actorUserId: session.user.id,
    action: "order.resend_confirmation_email",
    entity: "order",
    entityId: order.id,
    diff: { orderNumber: order.orderNumber, to: order.email, skipped: result.skipped, sendOk: result.ok },
  });

  if (!result.ok) return { ok: false, error: "The email could not be sent. Check server logs." };
  return {
    ok: true,
    message: result.skipped
      ? "RESEND_API_KEY isn't configured in this environment — the send was logged, not actually delivered."
      : `Confirmation email resent to ${order.email}.`,
  };
}

// ---------------------------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------------------------

const refundSchema = z.object({
  orderId: z.number().int().positive(),
  amountRupees: z.coerce.number().positive().max(1_000_000),
  note: z.string().trim().min(3).max(1000),
});

export async function recordRefundAction(input: z.infer<typeof refundSchema>): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };

  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const order = await getOrderById(parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const amountPaise = Math.round(parsed.data.amountRupees * 100);
  if (amountPaise > order.totalPaise) return { ok: false, error: "Refund amount cannot exceed the order total." };

  let razorpayRefundId: string | null = null;
  let razorpayNote: string;
  const client = getRazorpayRefundClient();
  if (!order.razorpayPaymentId) {
    razorpayNote = "No Razorpay payment id on this order (COD, or never paid via Razorpay) — nothing to refund via the API.";
  } else if (!client) {
    razorpayNote = "RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET aren't configured in this environment — the real Razorpay refund call could not be attempted. Recorded in the DB regardless.";
  } else {
    try {
      const result = await client.createRefund(order.razorpayPaymentId, amountPaise, { orderNumber: order.orderNumber });
      razorpayRefundId = result.id;
      razorpayNote = `Razorpay refund ${result.id} (${result.status}).`;
    } catch {
      razorpayNote = "The real Razorpay refund API call failed. Recorded in the DB regardless — retry the Razorpay call manually.";
    }
  }

  await recordRefundDb({ orderId: order.id, amountPaise, note: parsed.data.note, razorpayRefundId });
  await writeAuditLog({
    actorUserId: session.user.id,
    action: "order.refund",
    entity: "order",
    entityId: order.id,
    diff: {
      orderNumber: order.orderNumber,
      refundAmountPaise: { from: order.refundAmountPaise, to: amountPaise },
      note: parsed.data.note,
      razorpayRefundId,
    },
  });
  await revalidateOrder(order.orderNumber);
  return { ok: true, message: `Refund of ₹${(amountPaise / 100).toFixed(2)} recorded. ${razorpayNote}` };
}

// ---------------------------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------------------------

const cancelSchema = z.object({
  orderId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  confirmOrderNumber: z.string().trim().min(1),
});

/** Destructive — requires the caller to have typed the order's own number as confirmation
 * (PROMPTS.md Phase 7 item 5: "a real typed confirmation step... not just a browser confirm()
 * dialog"), checked server-side here, not merely gated by a disabled button in the UI. */
export async function cancelOrderAction(input: z.infer<typeof cancelSchema>): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const order = await getOrderById(parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (parsed.data.confirmOrderNumber !== order.orderNumber) {
    return { ok: false, error: `Type "${order.orderNumber}" exactly to confirm cancellation.` };
  }

  const result = await cancelOrderDb(order.id, parsed.data.reason);
  if (!result.ok) return { ok: false, error: result.error };

  await writeAuditLog({
    actorUserId: session.user.id,
    action: "order.cancel",
    entity: "order",
    entityId: order.id,
    diff: {
      orderNumber: order.orderNumber,
      status: { from: order.status, to: "cancelled" },
      reason: parsed.data.reason,
      restoredVariantIds: result.restoredVariantIds,
    },
  });

  // Stock changed — invalidate every storefront cache tag that could show it (CLAUDE.md §3.4).
  // `updateTag` (Next.js's read-your-own-writes primitive for Server Actions) rather than
  // `revalidateTag`, which in this Next.js version requires a cache-life profile argument not
  // relevant here — we want immediate expiration, which is exactly `updateTag`'s contract.
  updateTag("products");
  for (const slug of result.affectedProductSlugs) updateTag(`product:${slug}`);
  for (const slug of result.affectedCollectionSlugs) updateTag(`collection:${slug}`);
  await revalidateOrder(order.orderNumber);

  return { ok: true, message: "Order cancelled and stock restored." };
}

// ---------------------------------------------------------------------------------------------
// Staff note
// ---------------------------------------------------------------------------------------------

const noteSchema = z.object({ orderId: z.number().int().positive(), note: z.string().trim().min(1).max(2000) });

export async function addStaffNoteAction(input: z.infer<typeof noteSchema>): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };

  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const order = await getOrderById(parsed.data.orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const { before, after } = await addStaffNoteDb(order.id, parsed.data.note);
  await writeAuditLog({
    actorUserId: session.user.id,
    action: "order.staff_note",
    entity: "order",
    entityId: order.id,
    diff: { orderNumber: order.orderNumber, staffNote: { from: before, to: after } },
  });
  await revalidateOrder(order.orderNumber);
  return { ok: true, message: "Note added." };
}

/** Deletes a never-paid order (typed confirmation of its order number). Paid orders can't be deleted. */
export async function deleteUnpaidOrderAction(orderId: number, confirmNumber: string): Promise<AdminActionResult> {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  const order = await getOrderById(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (confirmNumber.trim().toUpperCase() !== order.orderNumber.toUpperCase()) return { ok: false, error: `Type ${order.orderNumber} exactly to confirm.` };

  const result = await deleteUnpaidOrderDb(orderId);
  if (!result.ok) return result;
  await writeAuditLog({
    actorUserId: session.user.id,
    action: "order.delete",
    entity: "order_deleted",
    entityId: orderId,
    diff: { orderNumber: order.orderNumber, email: order.email, totalPaise: order.totalPaise, paymentStatus: order.paymentStatus },
  });
  if (result.affectedProductSlugs.length > 0) {
    updateTag("products");
    for (const slug of result.affectedProductSlugs) updateTag(`product:${slug}`);
    for (const slug of result.affectedCollectionSlugs) updateTag(`collection:${slug}`);
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: true, message: `Order ${order.orderNumber} deleted.` };
}
