"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Placeholder } from "@/components/media/Placeholder";
import { PartyPopper } from "@/components/effects/PartyPopper";
import { dealShelf } from "@/lib/deals";
import { formatINR, paise } from "@/lib/money";
import { selectRupeesToFreeGiftPaise, useCartStore, type CartLine } from "@/lib/store/cart";

/** One product the popup can offer, already reduced to what the popup needs (built on the server in
 * AddDealsPopupServer.tsx from real catalogue data — nothing here is invented). */
export interface DealCandidate {
  productId: number;
  collectionSlug: string;
  collectionTitle: string;
  priority: number;
  name: string;
  href: string;
  image: { url: string; alt: string } | null;
  /** The cheapest in-stock variant — what one tap on "Add" puts in the cart. */
  variant: { id: number; sku: string; optionValue: string; mrpPaise: number; pricePaise: number };
  /** How many in-stock variants the product has, to decide whether "From" is honest. */
  variantCount: number;
}

export interface AddDealsPopupProps {
  /** Every in-stock product of each pillar — one is picked at random per pillar each time the popup opens. */
  candidates: DealCandidate[];
  /** Every published pillar or combo product's pillars (lib/pillars.ts), so an add can be classified —
   * a spice combo is "spices", a Blue + Red tea combo is both teas. */
  productPillars: Record<number, string[]>;
  /** `settings.free_gift_threshold_paise`, for the line under the title — `null` while the promotion is off. */
  freeGiftThresholdPaise: number | null;
}

/** Pages where the popup would only get in the way — the shopper is already in the cart flow. */
const QUIET_PATHS = ["/cart", "/checkout"];

/**
 * "Last minute add deals" (client brief, 2026-09-20): right after something is added to the cart, a
 * centred popup offers the other pillars — Blue Tea buyers see Red Tea / Spices / Black Tea, and so on
 * (lib/deals.ts holds the client's table) — with a party-popper burst behind it. Each card is a real
 * product at its real price (and real saving, via PriceBlock); one tap adds its cheapest in-stock pack.
 * Since 2026-10-10 the cards are a left/right scroller holding every product not yet in the cart, the
 * client's table leading (`dealShelf`), under a line nudging toward the free gift (`GiftNudge`).
 *
 * It replaces the cart drawer opening for that add (the store checks `dealsResolver`), and "View cart"
 * opens the drawer from here. Adds made from inside the popup skip the popup and the drawer. Prices
 * are only ever display: `addItem` → `revalidate()` re-prices everything on the server (CLAUDE.md §7.5).
 */
export function AddDealsPopup({ candidates, productPillars, freeGiftThresholdPaise }: AddDealsPopupProps) {
  const pathname = usePathname();
  const setDealsResolver = useCartStore((s) => s.setDealsResolver);
  const openCart = useCartStore((s) => s.open);
  const addItem = useCartStore((s) => s.addItem);

  const [open, setOpen] = useState(false);
  const [offered, setOffered] = useState<DealCandidate[]>([]);
  const [purchasedTitle, setPurchasedTitle] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  const byCollection = useMemo(() => {
    const map = new Map<string, DealCandidate[]>();
    for (const c of candidates) map.set(c.collectionSlug, [...(map.get(c.collectionSlug) ?? []), c]);
    return map;
  }, [candidates]);

  /** The offers for an add: every in-stock product not already in the cart, the client's table for
   * the pillar(s) the added product counts as leading (`dealShelf`). */
  const offersFor = useMemo(() => {
    return (productId: number, lines: CartLine[]): { purchasedName: string; deals: DealCandidate[] } => {
      const paid = lines.filter((l) => !l.isGift);
      const inCart = {
        pillars: new Set(paid.flatMap((l) => productPillars[l.productId] ?? [])),
        productIds: new Set(paid.map((l) => l.productId)),
      };
      // Shuffled per opening, so the lead cards differ each time rather than always the first.
      const deals = dealShelf(productPillars[productId] ?? [], inCart, byCollection, Math.random);
      return { purchasedName: lines.find((l) => l.productId === productId)?.productName ?? "", deals };
    };
  }, [productPillars, byCollection]);

  const quiet = QUIET_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Tell the store when this popup will handle an add, so it can leave the drawer closed.
  useEffect(() => {
    setDealsResolver((productId, lines) => !quiet && offersFor(productId, lines).deals.length > 0);
    return () => setDealsResolver(null);
  }, [setDealsResolver, offersFor, quiet]);

  // React to the store flagging an add for the popup (a new `lastAdded`).
  useEffect(() => {
    return useCartStore.subscribe((state, prev) => {
      const added = state.lastAdded;
      if (!added || added === prev.lastAdded) return;
      const { purchasedName, deals } = offersFor(added.productId, state.lines);
      if (deals.length === 0) {
        // Nothing to offer after all (state moved on since the resolver ran) — fall back to the drawer.
        openCart();
        return;
      }
      setOffered(deals);
      setPurchasedTitle(purchasedName);
      setAddedIds(new Set());
      setAddingId(null);
      setOpen(true);
    });
  }, [offersFor, openCart]);

  async function add(deal: DealCandidate) {
    setAddingId(deal.productId);
    await addItem(
      {
        variantId: deal.variant.id,
        productId: deal.productId,
        priority: deal.priority,
        qty: 1,
        productName: deal.name,
        optionValue: deal.variant.optionValue,
        sku: deal.variant.sku,
        mrpPaise: deal.variant.mrpPaise,
        unitPricePaise: deal.variant.pricePaise,
        imageUrl: deal.image?.url ?? null,
      },
      { skipDeals: true },
    );
    setAddingId(null);
    setAddedIds((prev) => new Set(prev).add(deal.productId));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/50 data-[state=open]:animate-[fade-in_180ms_ease]" />
        {/* The confetti sits on layer 50 (over the dimmed page) and the panel on 51, so it always paints
            under the popup whatever the DOM order ends up as. Mounted only while open, so each opening
            fires a fresh burst. */}
        {open && <PartyPopper />}
        <DialogPrimitive.Content
          data-popup="deals"
          className="fixed left-1/2 top-1/2 z-[51] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface p-5 shadow-lift focus:outline-none data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(.2,.6,.2,1)] sm:p-7"
        >
          <DialogTitle className="pr-8 font-display text-2xl font-semibold text-ink">
            <span aria-hidden="true">🎉 </span>Last minute add deals
          </DialogTitle>
          <GiftNudge purchasedTitle={purchasedTitle} thresholdPaise={freeGiftThresholdPaise} />

          <DealShelf count={offered.length}>
            {offered.map((deal) => {
              const added = addedIds.has(deal.productId);
              const adding = addingId === deal.productId;
              return (
                <li
                  key={deal.productId}
                  className="flex w-[46%] shrink-0 snap-start flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:w-[31%]"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-2">
                    {deal.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small popup thumbnail from an already-resolved storage URL.
                      <img src={deal.image.url} alt={deal.image.alt} className="size-full object-cover" loading="lazy" />
                    ) : (
                      <Placeholder slot="product-packshot-generic" className="size-full" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="type-eyebrow text-ink-2">{deal.collectionTitle}</p>
                    <p className="text-sm font-semibold leading-snug text-ink">{deal.name}</p>
                    <PriceBlock
                      mrpPaise={paise(deal.variant.mrpPaise)}
                      pricePaise={paise(deal.variant.pricePaise)}
                      prefix={deal.variantCount > 1 ? "From" : undefined}
                      showTaxNote={false}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={added ? "outline" : "gradient"}
                      disabled={adding || added}
                      onClick={() => void add(deal)}
                      className="mt-auto w-full"
                    >
                      {adding ? "Adding…" : added ? "✓ Added" : "Add to cart"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </DealShelf>

          {/* Client request, 2026-10-13: "Continue shopping" is the highlighted action on the right, "View
              cart" a plain underlined link on the left (on a phone the button stacks on top). */}
          <div className="mt-5 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openCart();
              }}
              className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
            >
              View cart
            </button>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="solid-ink" size="md" className="w-full sm:w-auto">
                Continue shopping
              </Button>
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

/**
 * The line under the title (client copy, 2026-10-10; bold and highlighted, without the "Added …"
 * prefix, 2026-10-13): how close the cart is to the free gift. The threshold is the settings value
 * handed down from the server, never a literal; with none set the promotion is off, and the line stays
 * the plain pairing prompt rather than promising a gift. The popup opens before the server has priced
 * this add, so "₹X more to go" waits for that reply instead of showing a gap worked out from the cart as
 * it was before the add. The highlight is the lemon stop with ink text — never white on citrus (§5.6).
 */
function GiftNudge({ purchasedTitle, thresholdPaise }: { purchasedTitle: string; thresholdPaise: number | null }) {
  const remainingPaise = useCartStore(selectRupeesToFreeGiftPaise);
  const validating = useCartStore((s) => s.isValidating);

  if (thresholdPaise == null) {
    return (
      <DialogDescription className="mt-1 text-sm text-ink-2">
        {purchasedTitle ? `Added ${purchasedTitle} — ` : ""}pair it with something else before you check out.
      </DialogDescription>
    );
  }
  const threshold = formatINR(paise(thresholdPaise));
  const unlocked = !validating && remainingPaise === 0;
  const toGoPaise = !validating && remainingPaise != null && remainingPaise > 0 ? remainingPaise : null;
  return (
    <DialogDescription className="mt-3 rounded-md border border-citrus bg-citrus/20 px-3 py-2 text-sm font-bold text-ink">
      <span aria-hidden="true">🎁 </span>
      {unlocked
        ? `You've unlocked a free gift with your ${threshold}+ order!`
        : `Unlock a free gift on orders of ${threshold} or more${toGoPaise != null ? ` — just ${formatINR(paise(toGoPaise))} more to go.` : "."}`}
    </DialogDescription>
  );
}

/**
 * The deal cards as a horizontal scroller with prev/next arrows — the same native scroll, snap and
 * arrow treatment as ProductCarousel (whose cards are links rather than add buttons, so it isn't reused
 * directly). The arrows page by roughly one view and hide at each end, and both stay hidden when every
 * card already fits. Mounted with the dialog's content, so it measures a track that exists.
 */
function DealShelf({ count, children }: { count: number; children: React.ReactNode }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollPrev(el.scrollLeft > 4);
      setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [count]);

  function scrollByView(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: el.clientWidth * 0.9 * direction, behavior: reduceMotion ? "auto" : "smooth" });
  }

  const arrow =
    "absolute top-[30%] flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card disabled:pointer-events-none disabled:opacity-0";

  return (
    <div className="relative mt-5 min-w-0">
      <ul
        ref={trackRef}
        aria-label="Deals to add"
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>

      {(canScrollPrev || canScrollNext) && (
        <>
          <button
            type="button"
            aria-label="Previous deals"
            disabled={!canScrollPrev}
            onClick={() => scrollByView(-1)}
            className={`${arrow} left-1`}
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M12.5 15 7.5 10l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="More deals"
            disabled={!canScrollNext}
            onClick={() => scrollByView(1)}
            className={`${arrow} right-1`}
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M7.5 15 12.5 10l-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
