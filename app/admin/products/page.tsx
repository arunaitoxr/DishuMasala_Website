import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatINR, paise } from "@/lib/money";
import { listAdminProducts, listCollectionsForPicker, type AdminProductListRow } from "@/lib/db/queries/admin-products";
import { RowActions } from "@/components/admin/RowActions";
import { archiveProductAction, deleteProductPermanentlyAction } from "./actions";

export const metadata = { title: "Products" };

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/products");

  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const sort = (first(sp.sort) as "name" | "priority" | "status" | "collection") || "priority";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";
  const search = first(sp.q);
  const statusParam = first(sp.status);
  const status = statusParam === "draft" || statusParam === "published" || statusParam === "archived" ? statusParam : undefined;
  const collectionId = first(sp.collection) ? Number(first(sp.collection)) : undefined;

  const [{ rows, total }, collections] = await Promise.all([
    listAdminProducts({ page, pageSize: PAGE_SIZE, sort, dir, search, status, collectionId }),
    listCollectionsForPicker(),
  ]);

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (collectionId) params.set("collection", String(collectionId));
    params.set("sort", sort);
    params.set("dir", dir);
    if (page > 1) params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    if (params.get("page") === "1") params.delete("page");
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  }

  const columns: DataTableColumn<AdminProductListRow>[] = [
    { key: "name", label: "Name", sortKey: "name", render: (r) => <span className="font-medium text-ink">{r.name}</span> },
    { key: "collection", label: "Collection", sortKey: "collection", render: (r) => r.collectionTitle },
    { key: "priority", label: "Priority", sortKey: "priority", align: "right", render: (r) => r.priority },
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      render: (r) => (
        <Badge tone={r.status === "published" ? "ok" : r.status === "archived" ? "crit" : "neutral"}>{r.status === "archived" ? "deleted" : r.status}</Badge>
      ),
    },
    { key: "variants", label: "Variants", align: "right", render: (r) => r.variantCount },
    { key: "images", label: "Images", align: "right", render: (r) => r.imageCount },
    {
      key: "price",
      label: "Price range",
      align: "right",
      render: (r) =>
        r.minPricePaise == null
          ? "—"
          : r.minPricePaise === r.maxPricePaise
            ? formatINR(paise(r.minPricePaise))
            : `${formatINR(paise(r.minPricePaise))} – ${formatINR(paise(r.maxPricePaise!))}`,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) =>
        r.status === "archived" ? (
          <RowActions
            editHref={`/admin/products/${r.id}`}
            editLabel="Open / restore"
            deleteLabel="Delete permanently"
            confirmText={r.slug}
            deleteDescription={`Removes ${r.name}, its variants, images and reviews for good. Past orders keep their own copy.`}
            onDelete={deleteProductPermanentlyAction.bind(null, r.id)}
          />
        ) : (
          <RowActions
            editHref={`/admin/products/${r.id}`}
            confirmText={r.slug}
            deleteDescription={`Takes ${r.name} off the site. It moves to Archived, where it can be restored.`}
            onDelete={archiveProductAction.bind(null, r.id)}
          />
        ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Products</h1>
        <Button asChild variant="solid-ink" size="sm">
          <Link href="/admin/products/new">New product</Link>
        </Button>
      </div>

      <form method="GET" action="/admin/products" className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-2">Search</label>
          <input id="q" name="q" defaultValue={search ?? ""} placeholder="Product name" className="h-10 w-56 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-2">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Deleted (archived)</option>
          </select>
        </div>
        <div>
          <label htmlFor="collection" className="mb-1 block text-xs font-medium text-ink-2">Collection</label>
          <select id="collection" name="collection" defaultValue={collectionId ? String(collectionId) : ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-surface">Filter</button>
        {(search || status || collectionId) && (
          <Link href="/admin/products" className="text-sm text-ink-2 underline underline-offset-4">Clear all</Link>
        )}
      </form>

      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(r) => `/admin/products/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={total}
          page={page}
          pageSize={PAGE_SIZE}
          sortKey={sort}
          sortDir={dir}
          hrefFor={hrefFor}
          emptyMessage="No products match these filters."
          caption="Products"
        />
      </div>
    </div>
  );
}
