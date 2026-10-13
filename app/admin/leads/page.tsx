import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { listAdminPhoneLeads, ADMIN_LEADS_PAGE_SIZE } from "@/lib/db/queries/admin-leads";
import { formatDate, formatDateTime } from "@/lib/dates";

export const metadata = { title: "Phone leads" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * A plain table, not components/admin/DataTable — that component always makes every row a
 * keyboard/click-navigable link to a detail page (`rowHref` is required), and there is no detail
 * page for a phone lead to navigate to. A native `<table>` with real `<a>` pagination links is
 * already keyboard-operable on its own (CLAUDE.md §9's requirement) without borrowing a widget
 * built for a different shape of page.
 */
export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/leads");

  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const { rows, total } = await listAdminPhoneLeads({ page });
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_LEADS_PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ink">Phone leads</h1>
          <p className="mt-1 text-sm text-ink-2">
            Captured from the landing popup, with explicit WhatsApp/SMS consent. &quot;Products viewed&quot; is
            that visitor&apos;s own on-site browsing — use it to decide who to message and about what.
          </p>
        </div>
        <Link
          href="/admin/leads/export"
          className="flex h-10 shrink-0 items-center rounded-md border border-line px-4 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Export CSV
        </Link>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Phone leads</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Phone</th>
              <th scope="col" className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Consented</th>
              <th scope="col" className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Popup shown on</th>
              <th scope="col" className="border-b border-line px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Products viewed</th>
              <th scope="col" className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">Captured</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-3">No phone numbers captured yet.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 font-medium text-ink tabular-nums">{r.phone}</td>
                  <td className="px-4 py-3 text-ink-2">{formatDateTime(r.consentAt)}</td>
                  <td className="px-4 py-3 text-ink-2">{r.sourcePath ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{r.productViews}</td>
                  <td className="px-4 py-3 text-ink-2">{formatDate(r.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <Link
            href={`/admin/leads?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none text-ink-3" : "text-ink underline underline-offset-4"}
          >
            Previous
          </Link>
          <span className="text-ink-2">Page {page} of {totalPages}</span>
          <Link
            href={`/admin/leads?page=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none text-ink-3" : "text-ink underline underline-offset-4"}
          >
            Next
          </Link>
        </nav>
      )}
    </div>
  );
}
