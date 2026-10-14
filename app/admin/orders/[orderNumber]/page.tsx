import { notFound, redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getOrderByOrderNumber } from "@/lib/db/queries/orders";
import { getAuditLogForEntity } from "@/lib/db/queries/audit";
import { legalNextStatuses } from "@/lib/commerce/order-status";
import { formatINR } from "@/lib/money";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { OrderActions } from "./OrderActions";
import { formatDateTime } from "@/lib/dates";
import { DeleteOrder } from "./DeleteOrder";
import { orderDeletability } from "@/lib/commerce/order-delete";

export const metadata = { title: "Order detail" };

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warn",
  confirmed: "ok",
  packed: "ok",
  shipped: "ok",
  delivered: "ok",
  cancelled: "crit",
  refunded: "neutral",
};

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Order detail (PROMPTS.md Phase 7 item 4): item snapshots rendered from the stored snapshot
 * (order_items — never a live product join, CLAUDE.md §4), the pricing breakdown read straight
 * off the order row (no recomputation — lib/commerce/pricing.ts is only ever called at checkout
 * time; historical orders read their own stored totals), customer info, both addresses, payment
 * details, Shiprocket state, and a full status timeline reconstructed from audit_log.
 */
export default async function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/orders");

  const { orderNumber } = await params;
  const order = await getOrderByOrderNumber(orderNumber);
  if (!order) notFound();

  const auditEntries = await getAuditLogForEntity("order", order.id);
  const nextStatuses = legalNextStatuses(order.status);

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Placed {formatDateTime(order.placedAt, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <Badge tone={STATUS_TONE[order.status] ?? "neutral"} className="text-sm">
          {order.status}
        </Badge>
      </div>

      <OrderActions
        orderId={order.id}
        orderNumber={order.orderNumber}
        currentStatus={order.status}
        nextStatuses={nextStatuses}
        hasShiprocketOrderId={!!order.shiprocketOrderId}
        totalPaise={order.totalPaise}
        alreadyRefundedPaise={order.refundAmountPaise}
      />

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Items</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 font-medium">SKU</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-line last:border-b-0">
                <td className="py-2.5">
                  <p className="text-ink">{item.productName}</p>
                  <p className="text-xs text-ink-2">{item.optionValue}</p>
                </td>
                <td className="py-2.5 text-ink-2">{item.sku}</td>
                <td className="py-2.5 text-right tabular-nums">{formatINR(item.unitPricePaise)}</td>
                <td className="py-2.5 text-right tabular-nums">{item.qty}</td>
                <td className="py-2.5 text-right tabular-nums">{formatINR(item.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatINR(order.subtotalPaise)} />
          {order.discountPaise > 0 && <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`− ${formatINR(order.discountPaise)}`} />}
          <Row label="Shipping" value={order.shippingPaise === 0 ? "Free" : formatINR(order.shippingPaise)} />
          <Row label="Total" value={formatINR(order.totalPaise)} strong />
          {order.refundAmountPaise != null && <Row label="Refunded" value={formatINR(order.refundAmountPaise)} />}
        </dl>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Customer</h2>
          <p className="mt-2 text-sm text-ink">{order.shippingAddress.name}</p>
          <p className="text-sm text-ink-2">{order.email}</p>
          <p className="text-sm text-ink-2">{order.phone}</p>
        </section>
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Payment</h2>
          <p className="mt-2 text-sm text-ink">
            {order.paymentMethod.toUpperCase()} — <span className="text-ink-2">{order.paymentStatus}</span>
          </p>
          {order.razorpayOrderId && <p className="text-xs text-ink-2">Razorpay order: {order.razorpayOrderId}</p>}
          {order.razorpayPaymentId && <p className="text-xs text-ink-2">Razorpay payment: {order.razorpayPaymentId}</p>}
          {order.razorpayRefundId && <p className="text-xs text-ink-2">Razorpay refund: {order.razorpayRefundId}</p>}
        </section>
        <Address title="Shipping address" address={order.shippingAddress} />
        <Address title="Billing address" address={order.billingAddress ?? order.shippingAddress} />
        <section className="rounded-lg border border-line bg-surface p-5 sm:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Shiprocket</h2>
          {order.shiprocketOrderId ? (
            <>
              <p className="mt-2 text-sm text-ink">Shiprocket order: {order.shiprocketOrderId}</p>
              <p className="text-sm text-ink-2">
                {order.awb ? `AWB ${order.awb}${order.courier ? ` (${order.courier})` : ""}` : "AWB not yet assigned."}
              </p>
              {order.trackingUrl && (
                <a href={order.trackingUrl} className="text-sm text-brew-2 underline underline-offset-4">
                  Tracking link
                </a>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-warn">Not yet pushed to Shiprocket.</p>
          )}
        </section>
        {order.staffNote && (
          <section className="rounded-lg border border-line bg-surface p-5 sm:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Staff notes</h2>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{order.staffNote}</pre>
          </section>
        )}
      </div>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Status timeline</h2>
        {auditEntries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No audit history yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="border-l-2 border-line pl-3 text-sm">
                <p className="text-ink">
                  <span className="font-medium">{entry.action}</span>
                  {entry.actorName && <span className="text-ink-2"> — {entry.actorName}</span>}
                </p>
                <p className="text-xs text-ink-3">{formatDateTime(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
                {entry.diff != null && (
                  <pre className="mt-1 overflow-x-auto rounded-sm bg-surface-2 p-2 text-xs text-ink-2">
                    {JSON.stringify(entry.diff, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {orderDeletability(order).deletable && (
        <div className="mt-8">
          <DeleteOrder id={order.id} orderNumber={order.orderNumber} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-line pt-1.5 font-semibold text-ink" : "text-ink-2"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Address({ title, address }: { title: string; address: { name: string; line1: string; line2?: string; city: string; state: string; pincode: string; phone?: string } }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">{title}</h2>
      <address className="mt-2 text-sm not-italic text-ink-2">
        {address.name}
        <br />
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
        <br />
        {address.city}, {address.state} {address.pincode}
      </address>
    </section>
  );
}
