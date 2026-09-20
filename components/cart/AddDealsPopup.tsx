"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Placeholder } from "@/components/media/Placeholder";
import { PartyPopper } from "@/components/effects/PartyPopper";
import { dealsFor } from "@/lib/deals";
import { paise } from "@/lib/money";
import { useCartStore, type CartLine } from "@/lib/store/cart";

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
  /** One lead product per offered pillar. */
  candidates: DealCandidate[];
  /** Every published product's collection in the four pillars, so an add can be mapped to its pillar. */
  productCollections: Record<number, string>;
}

/** Pages where the popup would only get in the way — the shopper is already in the cart flow. */
const QUIET_PATHS = ["/cart", "/checkout"];

function collectionOf(productId: number, map: Record<number, string>): string | undefined {
  return map[productId];
}

/**
 * "Last minute add deals" (client brief, 2026-09-20): right after something is added to the cart, a
 * centred popup offers the other pillars — Blue Tea buyers see Red Tea / Spices / Black Tea, and so on
 * (lib/deals.ts holds the client's table) — with a party-popper burst behind it. Each card is a real
 * product at its real price (and real saving, via PriceBlock); one tap adds its cheapest in-stock pack.
 *
 * It replaces the cart drawer opening for that add (the store checks `dealsResolver`), and "View cart"
 * opens the drawer from here. Adds made from inside the popup skip the popup and the drawer. Prices
 * are only ever display: `addItem` → `revalidate()` re-prices everything on the server (CLAUDE.md §7.5).
 */
export function AddDealsPopup({ candidates, productCollections }: AddDealsPopupProps) {
  const pathname = usePathname();
  const setDealsResolver = useCartStore((s) => s.setDealsResolver);
  const openCart = useCartStore((s) => s.open);
  const addItem = useCartStore((s) => s.addItem);

  const [open, setOpen] = useState(false);
  const [offered, setOffered] = useState<DealCandidate[]>([]);
  const [purchasedTitle, setPurchasedTitle] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  const byCollection = useMemo(() => new Map(candidates.map((c) => [c.collectionSlug, c])), [candidates]);
  const titleBySlug = useMemo(() => new Map(candidates.map((c) => [c.collectionSlug, c.collectionTitle])), [candidates]);

  /** The offers for an add: the client's table for the purchased pillar, minus pillars already in the
   * cart, minus any pillar we have no in-stock product for. */
  const offersFor = useMemo(() => {
    return (productId: number, lines: CartLine[]): { purchased: string; deals: DealCandidate[] } => {
      const purchased = collectionOf(productId, productCollections) ?? "";
      const inCart = new Set(
        lines.filter((l) => !l.isGift).map((l) => collectionOf(l.productId, productCollections) ?? ""),
      );
      const deals = dealsFor(purchased, inCart)
        .map((slug) => byCollection.get(slug))
        .filter((c): c is DealCandidate => c != null);
      return { purchased, deals };
    };
  }, [productCollections, byCollection]);

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
      const { purchased, deals } = offersFor(added.productId, state.lines);
      if (deals.length === 0) {
        // Nothing to offer after all (state moved on since the resolver ran) — fall back to the drawer.
        openCart();
        return;
      }
      setOffered(deals);
      setPurchasedTitle(titleBySlug.get(purchased) ?? "");
      setAddedIds(new Set());
      setAddingId(null);
      setOpen(true);
    });
  }, [offersFor, titleBySlug, openCart]);

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
          <DialogDescription className="mt-1 text-sm text-ink-2">
            {purchasedTitle ? `Added ${purchasedTitle} — ` : ""}pair it with something else before you check out.
          </DialogDescription>

          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {offered.map((deal) => {
              const added = addedIds.has(deal.productId);
              const adding = addingId === deal.productId;
              return (
                <li key={deal.productId} className="flex gap-3 rounded-lg border border-line bg-surface p-3 sm:flex-col sm:gap-2">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:aspect-square sm:size-auto">
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
          </ul>

          <div className="mt-5 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
            <DialogPrimitive.Close className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
              Continue shopping
            </DialogPrimitive.Close>
            <Button
              type="button"
              variant="solid-ink"
              size="md"
              onClick={() => {
                setOpen(false);
                openCart();
              }}
              className="w-full sm:w-auto"
            >
              View cart
            </Button>
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
