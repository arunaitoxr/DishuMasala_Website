import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { listAdminPosts, listAdminPages, type AdminPostRow, type AdminPageRow } from "@/lib/db/queries/admin-content";
import { formatDate, formatDateTime } from "@/lib/dates";
import { RowActions } from "@/components/admin/RowActions";
import { isRequiredPageSlug } from "@/lib/content/page-slugs";
import { deletePageAction, deletePostAction } from "./actions";

export const metadata = { title: "Content" };

/** Published with a future date: the storefront shows it from that moment on. */
function isScheduled(r: AdminPostRow): boolean {
  return r.status === "published" && r.publishedAt != null && new Date(r.publishedAt).getTime() > Date.now();
}

export default async function AdminContentPage() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/content");

  const [posts, pages] = await Promise.all([listAdminPosts(), listAdminPages()]);

  const postColumns: DataTableColumn<AdminPostRow>[] = [
    { key: "title", label: "Title", render: (r) => <span className="font-medium text-ink">{r.title}</span> },
    { key: "kind", label: "Kind", render: (r) => <Badge tone="neutral">{r.kind}</Badge> },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        const scheduled = isScheduled(r);
        return <Badge tone={scheduled ? "warn" : r.status === "published" ? "ok" : "neutral"}>{scheduled ? "scheduled" : r.status}</Badge>;
      },
    },
    { key: "publishedAt", label: "Published", render: (r) => (r.publishedAt ? formatDateTime(r.publishedAt) : "—") },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) => (
        <RowActions
          editHref={`/admin/content/posts/${r.id}`}
          confirmText={r.slug}
          deleteDescription={`Deletes “${r.title}” and its cover image for good. To keep it, use Unpublish.`}
          onDelete={deletePostAction.bind(null, r.id)}
        />
      ),
    },
  ];

  const pageColumns: DataTableColumn<AdminPageRow>[] = [
    { key: "title", label: "Title", render: (r) => <span className="font-medium text-ink">{r.title}</span> },
    { key: "slug", label: "Slug", render: (r) => `/${r.slug}` },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "published" ? "ok" : "neutral"}>{r.status}</Badge> },
    { key: "updatedAt", label: "Updated", render: (r) => formatDate(r.updatedAt) },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (r) =>
        isRequiredPageSlug(r.slug) ? (
          <RowActions editHref={`/admin/content/pages/${r.id}`} />
        ) : (
          <RowActions
            editHref={`/admin/content/pages/${r.id}`}
            confirmText={r.slug}
            deleteDescription={`Deletes “${r.title}”; /${r.slug} stops working. To keep it, use Unpublish.`}
            onDelete={deletePageAction.bind(null, r.id)}
          />
        ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Content</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/admin/content/pages/new">New page</Link></Button>
          <Button asChild variant="solid-ink" size="sm"><Link href="/admin/content/posts/new">New post</Link></Button>
        </div>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Posts (blog &amp; recipes)</h2>
      <div className="mt-3">
        <DataTable
          columns={postColumns}
          rows={posts}
          rowHref={(r) => `/admin/content/posts/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={posts.length}
          page={1}
          pageSize={posts.length || 1}
          hrefFor={() => "/admin/content"}
          emptyMessage="No posts yet."
          caption="Posts"
        />
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Pages</h2>
      <div className="mt-3">
        <DataTable
          columns={pageColumns}
          rows={pages}
          rowHref={(r) => `/admin/content/pages/${r.id}`}
          rowKey={(r) => r.id}
          totalCount={pages.length}
          page={1}
          pageSize={pages.length || 1}
          hrefFor={() => "/admin/content"}
          emptyMessage="No pages yet."
          caption="Pages"
        />
      </div>
    </div>
  );
}
