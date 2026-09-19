import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/queries/users";
import { SignOutButton } from "@/components/account/SignOutButton";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: { template: "%s — Dishu Admin", default: "Dishu Admin" }, robots: { index: false, follow: false } };

/**
 * The admin shell (CLAUDE.md §9 / PROMPTS.md Phase 7 item 1). `middleware.ts` is the first gate
 * for `/admin/*`; this `requireStaffOrAdmin()` call is the redundant, independent re-check for
 * every single admin page render — same discipline as app/account/layout.tsx, but note the doc
 * warning that matters here: **Next.js layouts do not re-run their server logic on every
 * client-side navigation between sibling routes** (only on a hard load / when the segment itself
 * remounts). Relying on this layout alone would NOT re-check the role on every navigation within
 * `/admin/*`. That's why every admin page.tsx below also calls `requireStaffOrAdmin()` itself
 * (visible in each page's own top few lines) — this layout's check covers the shell chrome
 * (nav, signed-in identity) and the very first load; each page's own check is what's actually
 * enforced per-navigation. Every server ACTION re-checks independently again on top of that
 * (app/admin/orders/actions.ts, app/admin/settings/actions.ts) — three independent layers.
 *
 * Nav items for sections without a real page yet (PROMPTS.md item 1: "still appear... your call,
 * but don't 404 silently") link to a real "coming soon" stub — see app/admin/(stub)/coming-soon.tsx
 * — rather than being omitted or 404ing, so the sidebar always accurately represents the full
 * admin scope (CLAUDE.md §9) even before Phase 8 builds those sections out.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin");

  const staffUser = await getUserById(session.user.id);

  const navItems: Array<{ href: string; label: string; live: boolean }> = [
    { href: "/admin", label: "Dashboard", live: true },
    { href: "/admin/orders", label: "Orders", live: true },
    { href: "/admin/products", label: "Products", live: true },
    { href: "/admin/collections", label: "Collections", live: true },
    { href: "/admin/coupons", label: "Coupons", live: true },
    { href: "/admin/reviews", label: "Reviews", live: true },
    { href: "/admin/customers", label: "Customers", live: true },
    { href: "/admin/leads", label: "Phone leads", live: true },
    { href: "/admin/content", label: "Content", live: true },
    { href: "/admin/settings", label: "Settings", live: true },
  ];

  return (
    <div className="flex min-h-screen bg-bg font-sans text-ink">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-surface"
      >
        Skip to content
      </a>
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        {/* The one hairline gradient allowed in the admin (CLAUDE.md §9) — nothing else in this
         * tree uses a gradient anywhere. */}
        <div className="h-[3px] w-full" style={{ backgroundImage: "var(--gradient-lemon-shift)" }} aria-hidden="true" />
        <div className="border-b border-line px-5 py-5">
          <p className="font-display text-lg font-semibold text-ink">Dishu Admin</p>
          <p className="text-xs text-ink-2">Staff panel</p>
        </div>
        <nav aria-label="Admin sections" className="flex-1 space-y-0.5 px-3 py-4">
          {navItems.map((item) =>
            item.live ? (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brew-2)]"
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.href}
                href={`/admin/coming-soon?section=${encodeURIComponent(item.label)}`}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-ink-3 hover:bg-surface-2 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brew-2)]"
              >
                <span>{item.label}</span>
                <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-3">
                  Phase 8
                </span>
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-line px-4 py-4">
          <p className="truncate text-sm font-medium text-ink">{staffUser?.name ?? "Staff"}</p>
          <p className="truncate text-xs text-ink-2">{staffUser?.email}</p>
          <Badge tone={session.user.role === "admin" ? "gold" : "neutral"} className="mt-1.5">
            {session.user.role}
          </Badge>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <div id="admin-main" className="min-w-0 flex-1 px-6 py-8 [font-variant-numeric:tabular-nums] sm:px-8">
        {children}
      </div>
    </div>
  );
}
