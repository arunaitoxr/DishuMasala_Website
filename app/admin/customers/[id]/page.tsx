import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { Badge } from "@/components/ui/Badge";
import { formatINR, paise } from "@/lib/money";
import { getAdminCustomerById, getOrdersForCustomer, getReviewsForCustomer } from "@/lib/db/queries/admin-customers";
import { getAddressesForUser } from "@/lib/db/queries/addresses";
import { getWishlistCards } from "@/lib/db/queries/wishlist";
import { CustomerContactForm } from "../CustomerContactForm";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Customer" };

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/customers");

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();

  const customer = await getAdminCustomerById(customerId);
  if (!customer) notFound();

  const [orders, addresses, wishlist, reviews] = await Promise.all([
    getOrdersForCustomer(customerId),
    getAddressesForUser(customerId),
    getWishlistCards(customerId),
    getReviewsForCustomer(customerId),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/customers" className="text-sm text-ink-2 underline underline-offset-4">← Back to customers</Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="font-display text-2xl font-semibold text-ink">{customer.name}</h1>
        <Badge tone={customer.role === "customer" ? "neutral" : "gold"}>{customer.role}</Badge>
      </div>
      <p className="text-sm text-ink-2">{customer.email}</p>

      <div className="mt-6">
        <CustomerContactForm id={customer.id} name={customer.name} phone={customer.phone} />
      </div>

      <section className="mt-8 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Orders ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No orders yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-2">
                <th className="py-2">Order</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-b-0">
                  <td className="py-2">
                    <Link href={`/admin/orders/${o.orderNumber}`} className="underline underline-offset-4">{o.orderNumber}</Link>
                  </td>
                  <td className="py-2 capitalize text-ink-2">{o.status}</td>
                  <td className="py-2 text-right">{formatINR(paise(o.totalPaise))}</td>
                  <td className="py-2 text-right text-ink-2">{formatDate(o.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Addresses ({addresses.length})</h2>
        {addresses.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No saved addresses.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {addresses.map((a) => (
              <li key={a.id} className="text-sm text-ink-2">
                <span className="font-medium text-ink">{a.name}</span> · {a.phone}
                <br />
                {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}
                {a.isDefault && <Badge tone="gold" className="ml-2">Default</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Reviews ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No reviews written.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {reviews.map((r) => (
              <li key={r.id} className="text-ink-2">
                {r.productName} — {"★".repeat(r.rating)} <Badge tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "crit" : "warn"} className="ml-1">{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Wishlist ({wishlist.length})</h2>
        {wishlist.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">Empty.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-ink-2">
            {wishlist.map((w) => (
              <li key={w.productId}>
                <Link href={`/product/${w.slug}`} className="underline underline-offset-4">{w.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
