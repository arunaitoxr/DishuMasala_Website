"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/providers/SessionProvider";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/Drawer";
import type { MegaMenuColumn } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { formatINR, type Paise } from "@/lib/money";
import type { SiteBranding } from "@/lib/db/queries/settings";
import { useCartStore, selectItemCount } from "@/lib/store/cart";
import { useWishlistStore, selectWishlistCount } from "@/lib/store/wishlist";
import { getWishlistProductIdsAction } from "@/lib/actions/wishlist";

const ANNOUNCEMENT_DISMISSED_KEY = "dm-announcement-dismissed";

export interface HeaderClientProps {
  columns: MegaMenuColumn[];
  freeShippingThresholdPaise: Paise;
  logo: SiteBranding["logo"];
}

/** The real migrated logo when it exists, else the text wordmark it was always safe to fall back
 * to — CLAUDE.md §8's "degrade honestly" discipline, same as every other third-party asset. */
function BrandMark({ logo }: { logo: SiteBranding["logo"] }) {
  if (!logo) {
    return <span className="font-display text-lg font-semibold tracking-[-0.01em] text-ink sm:text-xl">Dishu Masala</span>;
  }
  // Fixed display height, width derived from the source aspect ratio — no CLS, no stretching.
  const displayHeight = 32;
  const displayWidth = Math.round((logo.width / logo.height) * displayHeight);
  return (
    <Image
      src={logo.url}
      alt={logo.alt}
      width={displayWidth}
      height={displayHeight}
      priority
      className="h-8 w-auto object-contain"
    />
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path
        d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20.5 8H6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17.5" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

function WishlistIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
      <path
        d="M10 17s-6.5-4.06-8.2-7.86C.6 6.6 2 3.5 5.2 3.1c1.9-.24 3.5.9 4.8 2.6 1.3-1.7 2.9-2.84 4.8-2.6 3.2.4 4.6 3.5 3.4 6.04C16.5 12.94 10 17 10 17Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 20c1.4-3.6 4.4-5.6 7.5-5.6s6.1 2 7.5 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
      <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="m17 17-3.4-3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconCountButton({
  icon,
  label,
  count,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  href: string;
  /** When present, a click opens something in-page (e.g. the cart drawer) instead of navigating —
   * `href` is still real so the control degrades to a normal link with JavaScript disabled. */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={count > 0 ? `${label} (${count})` : label}
      className="relative flex size-10 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      {icon}
      {count > 0 && (
        <span
          key={count}
          className="tabular-nums absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-hibiscus text-[10px] font-semibold text-white animate-[badge-pop_320ms_cubic-bezier(.16,1,.3,1)_both]"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

// Nav order (CLAUDE.md §7.2, amended 2026-09-10): Tea and Masala interleaved rather than tea-
// first-then-everything-else, matching `collections.priority` now that the DB values themselves
// were renumbered to interleave (data/catalog.json: blue-tea=1, spices=2, red-tea=3, combos=4,
// classic-teas=5). Kept as an explicit literal, not a derived sort, for the same reason the
// previous version was — a nav-specific display order shouldn't silently drift if `priority` is
// ever retuned for a different reason (e.g. a single product's placement) without a matching nav
// decision.
// `tea-combos` added 2026-09-17 when the combos range was split in two. It has to be listed:
// unlisted slugs get indexOf === -1 and sort to the FRONT of the nav, which is exactly what
// happened — Tea Combos appeared as the first item, ahead of Blue Tea.
const NAV_ORDER = ["blue-tea", "spices", "red-tea", "combos", "tea-combos", "classic-teas"];

export function HeaderClient({ columns, freeShippingThresholdPaise, logo }: HeaderClientProps) {
  const pathname = usePathname();
  // Flat list for the always-visible desktop nav, sorted to NAV_ORDER — see the comment at its
  // call site for why this flattens `columns` rather than fetching a second shape from the DB.
  const flatCollectionLinks = [...columns.flatMap((col) => col.items)].sort(
    (a, b) => NAV_ORDER.indexOf(a.slug) - NAV_ORDER.indexOf(b.slug),
  );

  const cartCount = useCartStore(selectItemCount);
  const openCart = useCartStore((s) => s.open);
  const { status } = useSession();
  const isSignedIn = status === "authenticated";
  const localWishlistCount = useWishlistStore(selectWishlistCount);
  const [dbWishlistCount, setDbWishlistCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Header wishlist count reflects whichever source currently applies (PROMPTS.md Phase 6 item 4):
  // DB-backed when signed in, localStorage when not. `dbWishlistCount` is simply never read while
  // signed out (see `wishlistCount` below), so there's nothing to reset in that branch — this
  // effect only ever subscribes to the DB count while there's a session to fetch it for.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    void getWishlistProductIdsAction().then((ids) => {
      if (!cancelled) setDbWishlistCount(ids.length);
    });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const wishlistCount = isSignedIn ? (dbWishlistCount ?? 0) : localWishlistCount;

  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reading localStorage (an external system) can only happen after mount — the server has no
    // localStorage, so this must run post-hydration to stay SSR-safe, which means the announcement
    // always paints first, then updates once if it was previously dismissed. That's the exact
    // "subscribe to an external system, call setState when it changes" case the react-hooks
    // set-state-in-effect rule's own guidance carves out as correct; there's no cascading-render
    // risk here (a single one-shot read, not a loop), so it's disabled for this one line rather
    // than restructured around useSyncExternalStore for a single localStorage flag.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY) === "1") setDismissed(true);
    } catch {
      // localStorage unavailable (private mode, disabled storage) — announcement just stays shown.
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const dismissAnnouncement = () => {
    setDismissed(true);
    try {
      localStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, "1");
    } catch {
      // Best-effort only — dismissal just won't be remembered on the next visit.
    }
  };

  return (
    <Drawer>
      {!dismissed && (
        // Citrus, not ink (client request: the offer strip should read as its own thing, not
        // blend into the same near-black chrome as the header/buttons/focus rings below it). Citrus
        // is the Lemon Shift's own final gradient stop and already what this project uses for "free
        // shipping" specifically (the cart's FreeShippingProgress bar) — this strip is that same
        // free-shipping claim (plus WELCOME5) surfaced at the very top, so reusing citrus for it is
        // on-brand rather than an arbitrary new colour. Dark ink text, never white/surface here:
        // white-on-citrus fails contrast outright (CLAUDE.md §5.6 already calls this out for the
        // gradient's citrus stop); ink-on-citrus clears 11:1, checked, not assumed.
        <div className="relative flex items-center justify-center gap-2 bg-citrus px-10 py-2 text-center text-xs font-medium text-ink sm:text-sm">
          {/* The coupon code was removed from this strip on 2026-09-17. It advertised WELCOME5 at
           * 5% off a first order while PhoneCapturePopup — which opens 5.5s into the same page view
           * — offers LUCKY10 at 10% off a first order. Two different first-order discounts visible
           * within a few seconds of each other reads as untrustworthy and trains shoppers to go
           * looking for a better code. Both coupons still exist and still work; only the top-strip
           * advertisement of the weaker one is gone, leaving the strip to carry the shipping
           * threshold, which is the claim that applies to everyone. */}
          <span>Free shipping over {formatINR(freeShippingThresholdPaise)}</span>
          <button
            type="button"
            onClick={dismissAnnouncement}
            aria-label="Dismiss announcement"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm hover:bg-ink/10"
          >
            ✕
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex max-w-7xl items-center gap-3 px-4 transition-[height] duration-200 ease-[cubic-bezier(.2,.6,.2,1)] sm:px-6",
            condensed ? "h-14" : "h-20",
          )}
        >
          <DrawerTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="flex size-10 items-center justify-center rounded-sm text-ink lg:hidden"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </DrawerTrigger>

          <Link href="/" className="flex items-center" aria-label="Dishu Masala — home">
            <BrandMark logo={logo} />
          </Link>

          {/* Flat top-level nav (client request, matching bluetea.co.in) — every collection is a
              direct link in the header itself, nothing hidden behind a "Shop" dropdown trigger.
              Flattened from `columns` (still DB-priority-ordered — CLAUDE.md §7.2) rather than
              adding a second data shape; the "Teas" grouping only mattered for the old dropdown's
              column layout. */}
          {/* `flex-nowrap` + per-link `whitespace-nowrap` (2026-09-17): adding the sixth collection
              (Tea Combos) took this row to nine items and it began wrapping onto a second line —
              every multi-word label ("Spice Combos", "Corporate Gifting") broke mid-label. The
              row fits at 1440px once labels are kept intact and the `lg` padding is tightened. */}
          <nav aria-label="Collections" className="ml-2 hidden min-w-0 flex-nowrap items-center gap-0.5 lg:flex">
            {flatCollectionLinks.map((item) => {
              const isActive = pathname === `/collections/${item.slug}`;
              return (
                <Link
                  key={item.slug}
                  href={`/collections/${item.slug}/`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold tracking-[-0.005em] transition-colors duration-150 xl:px-4",
                    isActive ? "text-brew-2" : "text-ink hover:bg-surface-2",
                  )}
                >
                  {item.title}
                  {isActive && (
                    <span aria-hidden="true" className="absolute inset-x-4 -bottom-0.5 h-[2px] rounded-full bg-brew-2" />
                  )}
                </Link>
              );
            })}
            <Link
              href="/shop/"
              aria-current={pathname === "/shop" ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold tracking-[-0.005em] transition-colors duration-150 xl:px-4",
                pathname === "/shop" ? "text-brew-2" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              All products
            </Link>
            <Link
              href="/corporate-gifting/"
              aria-current={pathname === "/corporate-gifting" ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold tracking-[-0.005em] transition-colors duration-150 xl:px-4",
                pathname === "/corporate-gifting" ? "text-brew-2" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              Corporate Gifting
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-0.5 pl-2 lg:pl-4">
            {searchOpen ? (
              <form
                role="search"
                onSubmit={(e) => e.preventDefault()}
                className="flex items-center"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSearchOpen(false);
                    searchButtonRef.current?.focus();
                  }
                }}
              >
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label="Search products"
                  placeholder="Search products…"
                  className="h-10 w-40 rounded-sm border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 sm:w-56"
                  onBlur={() => setSearchOpen(false)}
                />
              </form>
            ) : (
              <button
                ref={searchButtonRef}
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="flex size-10 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <SearchIcon />
              </button>
            )}
            <IconCountButton icon={<AccountIcon />} label="Account" count={0} href="/account" />
            <IconCountButton icon={<WishlistIcon />} label="Wishlist" count={wishlistCount} href="/account/wishlist" />
            <IconCountButton
              icon={<CartIcon />}
              label="Cart"
              count={cartCount}
              href="/cart/"
              onClick={(e) => {
                e.preventDefault();
                openCart();
              }}
            />
          </div>
        </div>
      </header>

      <DrawerContent side="left">
          <DrawerTitle className="mb-5 font-display text-lg font-semibold text-ink">Dishu Masala</DrawerTitle>
          <DrawerDescription className="sr-only">Site navigation</DrawerDescription>
          <nav aria-label="Mobile shop menu" className="flex flex-col gap-6">
            {columns.map((col) => (
              <div key={col.label}>
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{col.label}</p>
                <ul className="flex flex-col gap-2">
                  {col.items.map((item) => (
                    <li key={item.slug}>
                      <DrawerClose asChild>
                        <Link
                          href={`/collections/${item.slug}/`}
                          className="flex items-center gap-2 py-1.5 text-[0.95rem] font-medium text-ink-2"
                        >
                          {item.title}
                        </Link>
                      </DrawerClose>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="mt-8 flex flex-col gap-1 border-t border-line pt-5">
            <DrawerClose asChild>
              <Link href="/corporate-gifting/" className="py-2 text-sm font-medium text-ink-2">
                Corporate Gifting
              </Link>
            </DrawerClose>
            <DrawerClose asChild>
              <Link href="/account" className="py-2 text-sm font-medium text-ink-2">
                Account
              </Link>
            </DrawerClose>
            <DrawerClose asChild>
              <Link href="/account/wishlist" className="py-2 text-sm font-medium text-ink-2">
                Wishlist
              </Link>
            </DrawerClose>
            <DrawerClose asChild>
              <Link
                href="/cart/"
                className="py-2 text-sm font-medium text-ink-2"
                onClick={(e) => {
                  e.preventDefault();
                  openCart();
                }}
              >
                Cart{cartCount > 0 ? ` (${cartCount})` : ""}
              </Link>
            </DrawerClose>
          </div>
      </DrawerContent>
    </Drawer>
  );
}
