import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { formatINR, paise } from "@/lib/money";
import { listAdminCustomers, ADMIN_CUSTOMERS_PAGE_SIZE, type AdminCustomerRow } from "@/lib/db/queries/admin-customers";
import { formatDate } from "@/lib/dates";
import { RowActions } from "@/components/admin/RowActions";
import { deleteCustomerAction } from "./actions";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Customers" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/customers");

  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const search = first(sp.q);

  const { rows, total } = await listAdminCustomers({ search, page });

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (page > 1) params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    if (params.get("page") === "1") params.delete("page");
    const qs = params.toString();
    return qs ? `/admin/customers?${qs}` : "/admin/customers";
  }

  const columns: DataTableColumn<AdminCustomerRow>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium text-ink">{r.name}</span> },
    { key: "email", label: "Email", render: (r) => r.email },
    { key: "phone", label: "Phone", render: (r) => r.phone ?? "—" },
    { key: "orders", label: "Orders", align: "right", render: (r) => r.orderCount },
    { key: "ltv", label: "Lifetime value", align: "right", render: (r) => formatINR(paise(r.lifetimeValuePaise)) },
    { key: "since", label: "Customer since", render: (r) => formatDate(r.createdAt) },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <RowActions
          editHref={`/admin/customers/${r.id}`}
          confirmText={r.email}
          deleteDescription={`Deletes ${r.name}'s account, login, saved addresses and wishlist.${r.orderCount > 0 ? " Their orders stay on record." : ""}`}
          onDelete={deleteCustomerAction.bind(null, r.id)}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Customers</h1>
        <Button asChild variant="solid-ink" size="sm">
          <Link href="/admin/customers/new">Add customer</Link>
        </Button>
      </div>

      <form method="GET" action="/admin/customers" className="mt-5 flex items-end gap-3">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-2">Search</label>
          <input id="q" name="q" defaultValue={search ?? ""} placeholder="Name, email or phone" className="h-10 w-72 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3" />
        </div>
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-surface">Search</button>
        {search && <Link href="/admin/customers" className="text-sm text-ink-2 underline underline-offset-4">Clear</Link>}
      </form>

      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(r) => `/admin/customers/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={total}
          page={page}
          pageSize={ADMIN_CUSTOMERS_PAGE_SIZE}
          hrefFor={hrefFor}
          emptyMessage="No customers match this search."
          caption="Customers"
        />
      </div>
    </div>
  );
}
