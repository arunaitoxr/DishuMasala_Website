import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/Badge";
import { getPendingReviewIds, listAdminReviews, listProductsForReviewFilter, ADMIN_REVIEWS_PAGE_SIZE, type AdminReviewRow } from "@/lib/db/queries/admin-reviews";
import { BulkApproveButton } from "./BulkApproveButton";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { RowActions } from "@/components/admin/RowActions";
import { ReviewStatusControls } from "./ReviewStatusControls";
import { deleteReviewAction } from "./actions";

export const metadata = { title: "Reviews" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReviewsPage({ searchParams }: PageProps) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/reviews");

  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const statusParam = first(sp.status);
  const status = statusParam === "pending" || statusParam === "approved" || statusParam === "rejected" ? statusParam : undefined;
  const productId = first(sp.product) ? Number(first(sp.product)) : undefined;
  const sourceParam = first(sp.source);
  const source = sourceParam === "customer" || sourceParam === "staff" || sourceParam === "import" ? sourceParam : undefined;
  const search = first(sp.q)?.trim() || undefined;
  const rating = first(sp.rating) ? Number(first(sp.rating)) : undefined;

  const [{ rows, total }, products, pendingIds] = await Promise.all([
    listAdminReviews({ status, source, search, productId, rating, page }),
    listProductsForReviewFilter(),
    getPendingReviewIds({ productId, rating }),
  ]);

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    if (search) params.set("q", search);
    if (productId) params.set("product", String(productId));
    if (rating) params.set("rating", String(rating));
    if (page > 1) params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    if (params.get("page") === "1") params.delete("page");
    const qs = params.toString();
    return qs ? `/admin/reviews?${qs}` : "/admin/reviews";
  }

  const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "crit" } as const;
  const STATUS_LABEL = { pending: "pending", approved: "published", rejected: "hidden" } as const;
  const SOURCE_LABEL = { customer: "Customer", staff: "Staff", import: "Import" } as const;

  const columns: DataTableColumn<AdminReviewRow>[] = [
    { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: "product", label: "Product", render: (r) => r.productName },
    { key: "rating", label: "Rating", render: (r) => "★".repeat(r.rating) + "☆".repeat(5 - r.rating) },
    { key: "author", label: "Author", render: (r) => <span>{r.authorName}{r.verifiedBuyer && <Badge tone="ok" className="ml-1.5">Verified</Badge>}</span> },
    { key: "title", label: "Title", render: (r) => r.title ?? "—" },
    { key: "photos", label: "Photos", align: "right", render: (r) => r.photoCount },
    { key: "source", label: "Source", render: (r) => SOURCE_LABEL[r.source] },
    { key: "created", label: "Date", render: (r) => formatDate(r.createdAt) },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <div data-row-actions className="flex items-center justify-end gap-3">
          <ReviewStatusControls id={r.id} status={r.status} compact />
          <RowActions
            editHref={`/admin/reviews/${r.id}`}
            editLabel={r.source === "customer" ? "Open" : "Edit"}
            confirmText="delete"
            deleteDescription={`Deletes ${r.authorName}'s review and its photos for good. To take it off the site but keep it, use Hide instead.`}
            onDelete={deleteReviewAction.bind(null, r.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Reviews</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reviews/import">Import CSV</Link>
          </Button>
          <Button asChild variant="solid-ink" size="sm">
            <Link href="/admin/reviews/new">Add review</Link>
          </Button>
        </div>
      </div>

      <form method="GET" action="/admin/reviews" className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-2">Search</label>
          <input id="q" name="q" defaultValue={search ?? ""} placeholder="Name or words in the review" className="h-10 w-56 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-2">Status</label>
          {/* Defaults to "All" — it used to show "Pending" while actually listing every review. */}
          <select id="status" name="status" defaultValue={status ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Published</option>
            <option value="rejected">Hidden</option>
          </select>
        </div>
        <div>
          <label htmlFor="source" className="mb-1 block text-xs font-medium text-ink-2">Source</label>
          <select id="source" name="source" defaultValue={source ?? ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            <option value="customer">Customer</option>
            <option value="staff">Staff</option>
            <option value="import">Import</option>
          </select>
        </div>
        <div>
          <label htmlFor="product" className="mb-1 block text-xs font-medium text-ink-2">Product</label>
          <select id="product" name="product" defaultValue={productId ? String(productId) : ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rating" className="mb-1 block text-xs font-medium text-ink-2">Rating</label>
          <select id="rating" name="rating" defaultValue={rating ? String(rating) : ""} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} star</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-surface">Filter</button>
        {(status || source || search || productId || rating) && (
          <Link href="/admin/reviews" className="text-sm text-ink-2 underline underline-offset-4">Clear all</Link>
        )}
        <BulkApproveButton productId={productId} rating={rating} pendingCount={pendingIds.length} />
      </form>

      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(r) => `/admin/reviews/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={total}
          page={page}
          pageSize={ADMIN_REVIEWS_PAGE_SIZE}
          hrefFor={hrefFor}
          emptyMessage="No reviews match these filters."
          caption="Reviews"
        />
      </div>
    </div>
  );
}
