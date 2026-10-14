import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/Button";
import { listAdminCollections, type AdminCollectionRow } from "@/lib/db/queries/admin-collections";
import { RowActions } from "@/components/admin/RowActions";
import { deleteCollectionAction } from "./actions";

export const metadata = { title: "Collections" };

export default async function AdminCollectionsPage() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/collections");

  const rows = await listAdminCollections();

  const columns: DataTableColumn<AdminCollectionRow>[] = [
    { key: "priority", label: "Priority", align: "right", render: (r) => <span className="font-semibold">{r.priority}</span> },
    { key: "title", label: "Title", render: (r) => <span className="font-medium text-ink">{r.title}</span> },
    { key: "slug", label: "Slug", render: (r) => r.slug },
    { key: "tagline", label: "Tagline", render: (r) => r.tagline ?? "—" },
    { key: "accent", label: "Accent token", render: (r) => r.accentToken ?? "—" },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <RowActions
          editHref={`/admin/collections/${r.id}`}
          confirmText={r.slug}
          deleteDescription={`Deletes the ${r.title} collection. Only possible once no product belongs to it.`}
          onDelete={deleteCollectionAction.bind(null, r.id)}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Collections</h1>
        <Button asChild variant="solid-ink" size="sm">
          <Link href="/admin/collections/new">New collection</Link>
        </Button>
      </div>
      <p className="mt-2 max-w-xl text-sm text-ink-2">
        Priority controls storefront order everywhere — lower sorts first (CLAUDE.md §7.2). Changing
        it here reorders the footer&apos;s collection list and the shop filter facets immediately, no
        rebuild needed.
      </p>
      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(r) => `/admin/collections/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={rows.length}
          page={1}
          pageSize={rows.length || 1}
          hrefFor={() => "/admin/collections"}
          emptyMessage="No collections yet."
          caption="Collections"
        />
      </div>
    </div>
  );
}
