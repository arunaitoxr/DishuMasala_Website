import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getOrderForUserByOrderNumber } from "@/lib/db/queries/orders";
import { getTrackingStatus } from "@/lib/shiprocket";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Order detail", robots: { index: false, follow: false } };

interface AccountOrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Ownership is enforced entirely inside `getOrderForUserByOrderNumber` — it filters by
 * `orders.user_id = userId` in the same query as `orders.order_number = orderNumber`, so this
 * page never has an "id from the URL" it trusts on its own (PROMPTS.md Phase 6 item 3, and
 * directly what the acceptance criteria's "reading another user's order by id fails" test
 * exercises). A nonexistent order number and someone else's real order both resolve to `null`
 * here and both render the same `notFound()` 404 — no signal about which order numbers are real
 * (same no-enumeration discipline as the guest order-token flow in app/order/[orderNumber]).
 */
export default async function AccountOrderDetailPage({ params }: AccountOrderDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { orderNumber } = await params;
  const order = await getOrderForUserByOrderNumber(orderNumber, user.id);
  if (!order) notFound();

  const tracking = order.awb ? await getTrackingStatus(order.awb).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-2">Order</p>
      <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{order.orderNumber}</h1>
      <p className="mt-1 text-sm capitalize text-ink-2">
        {order.status} · placed {formatDate(order.placedAt, { day: "numeric", month: "short", year: "numeric" })}
      </p>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-ink-2">Items</h2>
        <ul>
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between border-b border-line py-3 text-sm last:border-0">
              <div>
                <p className="font-medium text-ink">{item.productName}</p>
                <p className="text-ink-2">
                  {item.optionValue} × {item.qty}
                </p>
              </div>
              <p className="tabular-nums font-semibold text-ink">{formatINR(item.lineTotalPaise)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-2">Subtotal</dt>
            <dd className="tabular-nums text-ink">{formatINR(order.subtotalPaise)}</dd>
          </div>
          {order.discountPaise > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-2">Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
              <dd className="tabular-nums text-leaf">−{formatINR(order.discountPaise)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-2">Shipping</dt>
            <dd className="tabular-nums text-ink">{order.shippingPaise > 0 ? formatINR(order.shippingPaise) : "Free"}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="tabular-nums text-ink">{formatINR(order.totalPaise)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-ink-2">Delivery</h2>
        <p className="text-sm text-ink">
          {order.shippingAddress.name}
          <br />
          {order.shippingAddress.line1}
          {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
          <br />
          {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
        </p>

        {order.trackingUrl ? (
          <div className="mt-3 text-sm">
            <p>
              <a href={order.trackingUrl} className="font-medium text-brew-2 underline underline-offset-4">
                Track your shipment{order.courier ? ` — ${order.courier}` : ""}
              </a>
              {order.awb && <span className="text-ink-2"> (AWB {order.awb})</span>}
            </p>
            {tracking && (
              <p className="mt-1 text-ink-2">
                Live status: <span className="font-medium text-ink">{tracking.status}</span>
                {tracking.currentLocation ? ` — ${tracking.currentLocation}` : ""}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">
            {order.status === "delivered" ? "Delivered." : "Tracking details will appear here once your order ships."}
          </p>
        )}
      </section>
    </div>
  );
}
