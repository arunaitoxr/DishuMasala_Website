import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { Badge } from "@/components/ui/Badge";
import { PaginationLinks } from "@/components/ui/PaginationLinks";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import {
  INBOX_PAGE_SIZE,
  countNewInboxItems,
  listBulkEnquiries,
  listContactMessages,
  listNewsletterSubscribers,
} from "@/lib/db/queries/admin-inbox";
import { InboxItemActions } from "./InboxItemActions";

export const metadata = { title: "Inbox" };

const TABS = [
  { key: "messages", label: "Contact messages" },
  { key: "enquiries", label: "Corporate enquiries" },
  { key: "newsletter", label: "Newsletter sign-ups" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const th = "border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-2";
const td = "border-b border-line px-4 py-3 align-top text-sm text-ink";

/**
 * Everything customers send through the site — contact form, corporate gifting enquiry form,
 * newsletter box. All of it was stored with no admin view (client request 2026-10-14).
 */
export default async function AdminInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/inbox");

  const sp = await searchParams;
  const tabParam = first(sp.tab);
  const tab: Tab = tabParam === "enquiries" || tabParam === "newsletter" ? tabParam : "messages";
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const counts = await countNewInboxItems();

  const href = (t: Tab, p?: number) => `/admin/inbox?tab=${t}${p && p > 1 ? `&page=${p}` : ""}`;

  let body: React.ReactNode;
  let total = 0;
  if (tab === "messages") {
    const { rows, total: n } = await listContactMessages(page);
    total = n;
    body = rows.length === 0 ? null : (
      <table className="w-full border-collapse">
        <thead className="bg-surface-2"><tr><th className={th}>Received</th><th className={th}>From</th><th className={th}>Message</th><th className={th}>Status</th><th className={cn(th, "text-right")}>Actions</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className={cn(td, "whitespace-nowrap text-ink-2")}>{formatDateTime(m.createdAt, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className={td}>
                <span className="font-medium">{m.name}</span>
                <br />
                <a href={`mailto:${m.email}`} className="text-brew-1 underline-offset-4 hover:underline">{m.email}</a>
                {m.phone && <><br /><a href={`tel:${m.phone}`} className="text-ink-2">{m.phone}</a></>}
              </td>
              <td className={cn(td, "max-w-md whitespace-pre-wrap")}>{m.message}</td>
              <td className={td}><Badge tone={m.status === "new" ? "warn" : "ok"}>{m.status}</Badge></td>
              <td className={cn(td, "text-right")}><InboxItemActions kind="message" id={m.id} status={m.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === "enquiries") {
    const { rows, total: n } = await listBulkEnquiries(page);
    total = n;
    body = rows.length === 0 ? null : (
      <table className="w-full border-collapse">
        <thead className="bg-surface-2"><tr><th className={th}>Received</th><th className={th}>From</th><th className={th}>Requirement</th><th className={th}>Status</th><th className={cn(th, "text-right")}>Actions</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className={cn(td, "whitespace-nowrap text-ink-2")}>{formatDateTime(e.createdAt, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className={td}>
                <span className="font-medium">{e.fullName}</span>{e.company ? ` · ${e.company}` : ""}
                <br />
                <a href={`mailto:${e.email}`} className="text-brew-1 underline-offset-4 hover:underline">{e.email}</a> · <a href={`tel:${e.phone}`} className="text-ink-2">{e.phone}</a>
                <br />
                <span className="text-xs text-ink-3">{e.enquiryType} · {e.country}{e.website ? ` · ${e.website}` : ""}</span>
              </td>
              <td className={cn(td, "max-w-md whitespace-pre-wrap")}>{e.requirement}</td>
              <td className={td}><Badge tone={e.status === "new" ? "warn" : "ok"}>{e.status}</Badge></td>
              <td className={cn(td, "text-right")}><InboxItemActions kind="enquiry" id={e.id} status={e.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else {
    const { rows, total: n } = await listNewsletterSubscribers(page);
    total = n;
    body = rows.length === 0 ? null : (
      <table className="w-full border-collapse">
        <thead className="bg-surface-2"><tr><th className={th}>Signed up</th><th className={th}>Email</th><th className={th}>Source</th><th className={cn(th, "text-right")}>Actions</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className={cn(td, "whitespace-nowrap text-ink-2")}>{formatDateTime(s.createdAt, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className={td}>{s.email}</td>
              <td className={cn(td, "text-ink-2")}>{s.source ?? "—"}</td>
              <td className={cn(td, "text-right")}><InboxItemActions kind="newsletter" id={s.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));
  const newCount = (t: Tab) => (t === "messages" ? counts.messages : t === "enquiries" ? counts.enquiries : 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Inbox</h1>
      <p className="mt-1 text-sm text-ink-2">What customers send through the site&apos;s contact form, corporate gifting form and newsletter box.</p>
      <nav aria-label="Inbox sections" className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("rounded-md border px-3 py-1.5 text-sm", tab === t.key ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:bg-surface-2")}
          >
            {t.label}
            {newCount(t.key) > 0 && <span className="ml-1.5 rounded-full bg-warn/20 px-1.5 text-xs font-semibold text-warn">{newCount(t.key)} new</span>}
          </Link>
        ))}
      </nav>
      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
        {body ?? <p className="px-4 py-16 text-center text-sm text-ink-2">Nothing here yet.</p>}
        {totalPages > 1 && (
          <div className="flex justify-center border-t border-line px-4 py-3">
            <PaginationLinks page={page} totalPages={totalPages} hrefFor={(p) => href(tab, p)} />
          </div>
        )}
      </div>
    </div>
  );
}
