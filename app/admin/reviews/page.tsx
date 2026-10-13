import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/Badge";
import { listAdminReviews, listProductsForReviewFilter, ADMIN_REVIEWS_PAGE_SIZE, type AdminReviewRow } from "@/lib/db/queries/admin-reviews";
import { BulkApproveButton } from "./BulkApproveButton";
import { formatDate } from "@/lib/dates";

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
  const status = first(sp.status) as "pending" | "approved" | "rejected" | undefined;
  const productId = first(sp.product) ? Number(first(sp.product)) : undefined;
  const rating = first(sp.rating) ? Number(first(sp.rating)) : undefined;

  const [{ rows, total }, products] = await Promise.all([
    listAdminReviews({ status, productId, rating, page }),
    listProductsForReviewFilter(),
  ]);

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
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

  const columns: DataTableColumn<AdminReviewRow>[] = [
    { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: "product", label: "Product", render: (r) => r.productName },
    { key: "rating", label: "Rating", render: (r) => "★".repeat(r.rating) + "☆".repeat(5 - r.rating) },
    { key: "author", label: "Author", render: (r) => <span>{r.authorName}{r.verifiedBuyer && <Badge tone="ok" className="ml-1.5">Verified</Badge>}</span> },
    { key: "title", label: "Title", render: (r) => r.title ?? "—" },
    { key: "photos", label: "Photos", align: "right", render: (r) => r.photoCount },
    { key: "created", label: "Submitted", render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Reviews</h1>

      <form method="GET" action="/admin/reviews" className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-2">Status</label>
          <select id="status" name="status" defaultValue={status ?? "pending"} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
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
        {(status || productId || rating) && (
          <Link href="/admin/reviews" className="text-sm text-ink-2 underline underline-offset-4">Clear all</Link>
        )}
        <BulkApproveButton productId={productId} rating={rating} />
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
