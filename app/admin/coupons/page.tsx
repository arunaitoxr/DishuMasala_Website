import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatINR, paise } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { COUPON_STATE_LABEL, couponDiscountLabel, couponState, type CouponState } from "@/lib/commerce/coupon-summary";
import { listAdminCoupons, type AdminCouponRow } from "@/lib/db/queries/admin-coupons";
import { RowActions } from "@/components/admin/RowActions";
import { deleteCouponAction } from "./actions";

export const metadata = { title: "Coupons" };

const STATE_TONE: Record<CouponState, "ok" | "neutral" | "warn" | "crit"> = {
  active: "ok",
  inactive: "neutral",
  scheduled: "warn",
  expired: "crit",
  used_up: "crit",
};

export default async function AdminCouponsPage() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/coupons");

  const rows = await listAdminCoupons();

  const now = new Date();
  const columns: DataTableColumn<AdminCouponRow>[] = [
    { key: "code", label: "Code", render: (r) => <span className="font-mono font-medium text-ink">{r.code}</span> },
    { key: "discount", label: "Discount", render: (r) => couponDiscountLabel(r) },
    { key: "minSpend", label: "Min spend", align: "right", render: (r) => (r.minSpendPaise != null ? formatINR(paise(r.minSpendPaise)) : "—") },
    { key: "firstOrder", label: "First order only", render: (r) => (r.firstOrderOnly ? "Yes" : "No") },
    { key: "usage", label: "Usage", align: "right", render: (r) => `${r.usedCount}${r.usageLimit != null ? ` / ${r.usageLimit}` : ""}` },
    { key: "perUser", label: "Per-user limit", align: "right", render: (r) => r.perUserLimit ?? "—" },
    {
      key: "window",
      label: "Valid",
      render: (r) =>
        r.startsAt || r.endsAt
          ? `${r.startsAt ? formatDateTime(r.startsAt, { dateStyle: "medium", timeStyle: "short" }) : "now"} → ${r.endsAt ? formatDateTime(r.endsAt, { dateStyle: "medium", timeStyle: "short" }) : "no end"}`
          : "Always",
    },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        const state = couponState(r, now);
        return <Badge tone={STATE_TONE[state]}>{COUPON_STATE_LABEL[state]}</Badge>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <RowActions
          editHref={`/admin/coupons/${r.id}`}
          confirmText={r.code}
          deleteDescription={
            r.usedCount > 0
              ? `${r.code} has been used on ${r.usedCount} paid order${r.usedCount === 1 ? "" : "s"}; those orders keep the discount they got.`
              : `${r.code} will stop working immediately.`
          }
          onDelete={deleteCouponAction.bind(null, r.id)}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Coupons</h1>
        <Button asChild variant="solid-ink" size="sm">
          <Link href="/admin/coupons/new">New coupon</Link>
        </Button>
      </div>
      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(r) => `/admin/coupons/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={rows.length}
          page={1}
          pageSize={rows.length || 1}
          hrefFor={() => "/admin/coupons"}
          emptyMessage="No coupons yet."
          caption="Coupons"
        />
      </div>
    </div>
  );
}
