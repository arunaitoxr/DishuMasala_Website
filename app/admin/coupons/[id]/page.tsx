import { notFound, redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getAdminCouponById, getCouponRedemptions, listProductsAndCollectionsForPicker } from "@/lib/db/queries/admin-coupons";
import { formatINR, paise } from "@/lib/money";
import { CouponForm } from "../CouponForm";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Edit coupon" };

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/coupons");

  const { id } = await params;
  const couponId = Number(id);
  if (!Number.isInteger(couponId)) notFound();

  const [coupon, picker, redemptions] = await Promise.all([
    getAdminCouponById(couponId),
    listProductsAndCollectionsForPicker(),
    getCouponRedemptions(couponId),
  ]);
  if (!coupon) notFound();

  return (
    <div>
      <h1 className="font-mono text-2xl font-semibold text-ink">{coupon.code}</h1>
      <div className="mt-6">
        <CouponForm mode="edit" coupon={coupon} picker={picker} />
      </div>

      <section className="mt-8 max-w-2xl rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Redemption history</h2>
        {redemptions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No redemptions yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-2">
                <th className="py-2">Order</th>
                <th className="py-2">Email</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="py-2">{r.orderNumber}</td>
                  <td className="py-2 text-ink-2">{r.orderEmail}</td>
                  <td className="py-2 text-right">{formatINR(paise(r.orderTotalPaise))}</td>
                  <td className="py-2 text-right text-ink-2">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
