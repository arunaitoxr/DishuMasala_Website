import "server-only";

/**
 * Transactional email (CLAUDE.md §2 / PROMPTS.md Phase 5 item 10). No `RESEND_API_KEY` exists in
 * this dev environment — rather than throwing and blocking an order, every send function here
 * logs the would-be send (recipient, subject, template) at `warn` and resolves successfully when
 * Resend isn't configured. A real key makes it a real send with no code change.
 *
 * Called only from route handlers/server actions, and always AFTER their DB transaction has
 * committed (never from inside `db.transaction(...)` — see app/api/checkout/route.ts and
 * app/api/payment/verify/route.ts for where these calls actually sit in the request flow).
 */
import { Resend } from "resend";
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import OrderConfirmationEmail from "@/emails/OrderConfirmation";
import PaymentReceivedEmail from "@/emails/PaymentReceived";
import OrderShippedEmail from "@/emails/OrderShipped";
import OrderDeliveredEmail from "@/emails/OrderDelivered";
import OrderCancelledEmail from "@/emails/OrderCancelled";
import NewOrderReceivedEmail from "@/emails/NewOrderReceived";
import VerifyEmail from "@/emails/VerifyEmail";
import ResetPasswordEmail from "@/emails/ResetPassword";
import type { Order } from "@/types/order";

const FROM_ADDRESS = process.env.EMAIL_FROM || "Dishu Food and Beverages <orders@dishumasala.in>";

export interface EmailSendResult {
  ok: boolean;
  /** True when there was no RESEND_API_KEY to actually send with — the caller should treat this
   * exactly like success (the order must never be blocked on email delivery). */
  skipped: boolean;
}

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function send(to: string, subject: string, element: ReactElement, templateName: string): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not configured — would send "${templateName}" to ${to}: "${subject}"`);
    return { ok: true, skipped: true };
  }
  try {
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    const result = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html, text });
    if (result.error) {
      console.error(`[email] Resend rejected "${templateName}" to ${to}:`, result.error);
      return { ok: false, skipped: false };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    console.error(`[email] send failed for "${templateName}" to ${to}`, err);
    return { ok: false, skipped: false };
  }
}

export async function sendOrderConfirmationEmail(order: Order, confirmationUrl: string): Promise<EmailSendResult> {
  return send(
    order.email,
    `Order confirmed — ${order.orderNumber}`,
    OrderConfirmationEmail({ order, confirmationUrl }),
    "order-confirmation",
  );
}

export async function sendPaymentReceivedEmail(order: Order): Promise<EmailSendResult> {
  return send(order.email, `Payment received — ${order.orderNumber}`, PaymentReceivedEmail({ order }), "payment-received");
}

export async function sendOrderShippedEmail(order: Order): Promise<EmailSendResult> {
  return send(order.email, `Your order has shipped — ${order.orderNumber}`, OrderShippedEmail({ order }), "order-shipped");
}

export async function sendOrderDeliveredEmail(order: Order): Promise<EmailSendResult> {
  return send(order.email, `Delivered — ${order.orderNumber}`, OrderDeliveredEmail({ order }), "order-delivered");
}

export async function sendOrderCancelledEmail(order: Order, reason?: string | null): Promise<EmailSendResult> {
  return send(order.email, `Order cancelled — ${order.orderNumber}`, OrderCancelledEmail({ order, reason }), "order-cancelled");
}

/** The one email in this file addressed to staff, not a shopper — `to` is
 * `settings.store_address.email`, read by the caller (lib/commerce/order-fulfillment.ts), never
 * `order.email`. */
export async function sendNewOrderStaffEmail(to: string, order: Order, adminOrderUrl: string): Promise<EmailSendResult> {
  return send(
    to,
    `New order — ${order.orderNumber} (${order.paymentMethod === "cod" ? "COD" : "paid"})`,
    NewOrderReceivedEmail({ order, adminOrderUrl }),
    "new-order-staff",
  );
}

/** Account emails (PROMPTS.md Phase 6 item 1) — same degrade-to-log-not-send behaviour as every
 * order email above when RESEND_API_KEY isn't configured (true in this dev environment). */
export async function sendVerifyEmail(to: string, name: string, verifyUrl: string): Promise<EmailSendResult> {
  return send(to, "Verify your email — Dishu Masala", VerifyEmail({ verifyUrl, name }), "verify-email");
}

export async function sendResetPasswordEmail(to: string, name: string, resetUrl: string): Promise<EmailSendResult> {
  return send(to, "Reset your password — Dishu Masala", ResetPasswordEmail({ resetUrl, name }), "reset-password");
}
