import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getOrdersForUser } from "@/lib/db/queries/orders";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Your orders", robots: { index: false, follow: false } };

export default async function AccountOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const orders = await getOrdersForUser(user.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Orders</h1>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-2">You haven&apos;t placed an order yet — once you do, it&apos;ll show up here.</p>
          <Link href="/shop/" className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4">
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${order.orderNumber}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface p-4 hover:border-ink/30"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{order.orderNumber}</p>
                  <p className="text-xs text-ink-2">
                    {formatDate(order.placedAt, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    <span className="capitalize">{order.status}</span>
                  </p>
                </div>
                <p className="tabular-nums text-sm font-semibold text-ink">{formatINR(order.totalPaise)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
