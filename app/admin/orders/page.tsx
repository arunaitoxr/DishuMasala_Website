import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatINR } from "@/lib/money";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  getAdminOrdersPage,
  parseAdminOrderFilters,
  adminOrderFiltersToSearchParams,
  type AdminOrderRow,
  type AdminOrderFilters,
} from "@/lib/db/queries/admin-orders";
import { formatDateTime } from "@/lib/dates";
import { RowActions } from "@/components/admin/RowActions";
import { deleteUnpaidOrderAction } from "./actions";

export const metadata = { title: "Orders" };

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warn",
  confirmed: "ok",
  packed: "ok",
  shipped: "ok",
  delivered: "ok",
  cancelled: "crit",
  refunded: "neutral",
};

function buildUrl(filters: AdminOrderFilters, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams(adminOrderFiltersToSearchParams(filters));
  for (const [k, v] of Object.entries(overrides)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  if (params.get("page") === "1") params.delete("page");
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The admin orders list (PROMPTS.md Phase 7 item 4) — filters (status, payment method, date
 * range, search) live entirely in the URL, matching Phase 3's shop-filter discipline. This is the
 * exact query the perf-test report (scripts/seed-perf-orders.ts) times against 5,000 rows.
 */
function isNeverPaid(r: AdminOrderRow): boolean {
  return (r.paymentStatus === "pending" || r.paymentStatus === "failed") && (r.status === "pending" || r.status === "cancelled") && !r.shiprocketOrderId;
}

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/orders");

  const filters = parseAdminOrderFilters(await searchParams);
  const { rows, totalCount } = await getAdminOrdersPage(filters);

  const columns: DataTableColumn<AdminOrderRow>[] = [
    { key: "orderNumber", label: "Order", render: (r) => <span className="font-medium">{r.orderNumber}</span> },
    { key: "customer", label: "Customer", render: (r) => <span className="text-ink-2">{r.email}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>,
    },
    { key: "paymentMethod", label: "Payment", render: (r) => <span className="uppercase text-xs text-ink-2">{r.paymentMethod}</span> },
    {
      key: "shiprocket",
      label: "Shiprocket",
      render: (r) =>
        r.awb ? (
          <span className="text-ok">AWB {r.awb}</span>
        ) : r.shiprocketOrderId ? (
          <span className="text-ink-2">Pushed, no AWB</span>
        ) : (
          <span className="text-warn">Not pushed</span>
        ),
    },
    { key: "total", label: "Total", sortKey: "total", align: "right", render: (r) => formatINR(r.totalPaise) },
    {
      key: "placedAt",
      label: "Placed",
      sortKey: "placed_at",
      render: (r) => formatDateTime(r.placedAt, { dateStyle: "medium", timeStyle: "short" }),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      // Delete only for orders that were never paid (abandoned/failed checkouts, tests) — the
      // server re-checks; paid orders are financial records and can only be cancelled or refunded.
      render: (r) =>
        isNeverPaid(r) ? (
          <RowActions
            editHref={`/admin/orders/${r.orderNumber}`}
            editLabel="View"
            confirmText={r.orderNumber}
            deleteDescription={`${r.orderNumber} was never paid. It and its line items are removed for good.`}
            onDelete={deleteUnpaidOrderAction.bind(null, r.id)}
          />
        ) : (
          <RowActions editHref={`/admin/orders/${r.orderNumber}`} editLabel="View" />
        ),
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Orders</h1>

      <form method="GET" action="/admin/orders" className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-2">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Order number, phone or email"
            className="h-10 w-64 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-2">
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            {["pending", "confirmed", "packed", "shipped", "delivered", "cancelled", "refunded"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="method" className="mb-1 block text-xs font-medium text-ink-2">
            Payment
          </label>
          <select id="method" name="method" defaultValue={filters.paymentMethod ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            <option value="razorpay">Razorpay</option>
            <option value="cod">COD</option>
          </select>
        </div>
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-2">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={filters.dateFrom ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink" />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-2">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.dateTo ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink" />
        </div>
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-surface">
          Filter
        </button>
        {(filters.status || filters.paymentMethod || filters.dateFrom || filters.dateTo || filters.q) && (
          <Link href="/admin/orders" className="text-sm text-ink-2 underline underline-offset-4">
            Clear all
          </Link>
        )}
      </form>

      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(r) => `/admin/orders/${r.orderNumber}`}
          rowKey={(r) => r.id}
          totalCount={totalCount}
          page={filters.page}
          pageSize={ADMIN_ORDERS_PAGE_SIZE}
          sortKey={filters.sort === "total" ? "total" : "placed_at"}
          sortDir={filters.dir}
          hrefFor={(overrides) => buildUrl(filters, overrides)}
          exportHref={`/admin/orders/export?${new URLSearchParams(adminOrderFiltersToSearchParams(filters)).toString()}`}
          emptyMessage="No orders match these filters."
          caption="Orders"
        />
      </div>
    </div>
  );
}
