"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Button } from "@/components/ui/Button";
import { Rating } from "@/components/ui/Rating";
import { useWishlistToggle } from "@/lib/hooks/useWishlistToggle";
import { cn } from "@/lib/cn";
import { formatINR, type Paise } from "@/lib/money";
import type { Variant } from "@/types/catalog";

export interface AddToCartPayload {
  variantId: number;
  sku: string;
  qty: number;
  unitPricePaise: number;
}

export interface BuyBoxProps {
  productId: number;
  productName: string;
  optionLabel: string;
  variants: Variant[];
  /** The product's own primary photo — shown above the option value on every variant card
   * (client request, 2026-09-17). One photo for every card, not a per-variant image: the catalogue
   * has no per-variant photography (all sizes/tiers of one product share the same pack shot), so
   * repeating the real primary image is honest — never a placeholder standing in per-card. */
  imageUrl: string | null;
  reviewCount: number;
  reviewAverage: number;
  /** For the trust-badge row's free-shipping claim — read from `settings`, never hardcoded
   * (CLAUDE.md §7.4). */
  freeShippingThresholdPaise: Paise;
  /** Fires on every payload change (variant/qty) — Phase 5's cart store is the eventual real
   * consumer; for now this is how a caller (or a test) observes the live payload. */
  onPayloadChange?: (payload: AddToCartPayload) => void;
  /** Fires only on an explicit "Add to cart" click. No persistence layer exists yet (Phase 5
   * builds lib/store/cart.ts) — the click is real and the payload is correct, it just has nowhere
   * durable to go yet. */
  onAddToCart?: (payload: AddToCartPayload) => void;
}

/** Boolean-vs-count stock line (CLAUDE.md §7.6): a null `stockQty` — true for every seeded variant
 * today, since the source catalogue only ever recorded in/out of stock — never renders a number. */
function StockLine({ variant }: { variant: Variant }) {
  if (!variant.inStock) {
    return <p className="text-sm font-medium text-crit">Out of stock</p>;
  }
  if (variant.stockQty != null && variant.stockQty < 10) {
    return <p className="text-sm font-medium text-warn">Only {variant.stockQty} left</p>;
  }
  return <p className="text-sm font-medium text-ok">In stock</p>;
}

/**
 * Small, verifiable-only trust row (CLAUDE.md §8: "trust claims ship only with what is
 * verifiable") — double-layer packaging, the real free-shipping threshold, and sourcing quality.
 * Deliberately not icons-plus-invented-claims; short, factual lines, matching Blue Tea's reference
 * structure without borrowing any of its actual copy.
 *
 * The sourcing line no longer names Punjab specifically — client request (2026-09-17): "Sourced
 * from the best specified areas to maintain the quality and aroma" everywhere this claim appears.
 */
function TrustBadgeRow({ freeShippingThresholdPaise }: { freeShippingThresholdPaise: Paise }) {
  const badges = [
    "Double-layer sealed packaging",
    `Free shipping over ${formatINR(freeShippingThresholdPaise)}`,
    "Sourced from the best specified areas to maintain quality and aroma",
  ];
  return (
    <ul className="grid grid-cols-1 gap-x-3 gap-y-1.5 border-y border-line py-3 text-xs text-ink-2 sm:grid-cols-3 sm:gap-2 sm:border-none sm:py-0">
      {badges.map((b) => (
        <li key={b} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-gold" />
          {b}
        </li>
      ))}
    </ul>
  );
}

export function BuyBox({
  productId,
  productName,
  optionLabel,
  variants,
  imageUrl,
  reviewCount,
  reviewAverage,
  freeShippingThresholdPaise,
  onPayloadChange,
  onAddToCart,
}: BuyBoxProps) {
  const [variantId, setVariantId] = useState(variants[0]?.id);
  const [qty, setQty] = useState(1);
  const { wishlisted, toggle: toggleWishlist } = useWishlistToggle(productId);
  const [justAdded, setJustAdded] = useState(false);
  const groupName = useId();
  const packRailRef = useRef<HTMLDivElement>(null);
  const packCardRefs = useRef<(HTMLLabelElement | null)[]>([]);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) ?? variants[0],
    [variants, variantId],
  );

  // The "best value" tier (client request, 2026-09-17: highlight it with a running border) —
  // whichever real variant has the deepest discount off ITS OWN mrp, never a fixed/guessed tier.
  // Only marked when the variants genuinely differ (more than one distinct discount ratio) —
  // a product where every option carries the same discount has no real "best" one to call out.
  const bestValueVariantId = useMemo(() => {
    const ratios = variants.map((v) => (v.mrpPaise > 0 ? 1 - v.pricePaise / v.mrpPaise : 0));
    const distinctRatios = new Set(ratios.map((r) => Math.round(r * 1000)));
    if (distinctRatios.size <= 1) return null;
    let bestIndex = 0;
    for (let i = 1; i < ratios.length; i++) if (ratios[i] > ratios[bestIndex]) bestIndex = i;
    return variants[bestIndex]?.id ?? null;
  }, [variants]);

  const payload: AddToCartPayload | null = selected
    ? { variantId: selected.id, sku: selected.sku, qty, unitPricePaise: selected.pricePaise }
    : null;

  const selectVariant = (id: number) => {
    setVariantId(id);
    setJustAdded(false);
    const v = variants.find((x) => x.id === id);
    if (v) onPayloadChange?.({ variantId: v.id, sku: v.sku, qty, unitPricePaise: v.pricePaise });
  };

  const changeQty = (n: number) => {
    setQty(n);
    if (selected) onPayloadChange?.({ variantId: selected.id, sku: selected.sku, qty: n, unitPricePaise: selected.pricePaise });
  };

  // "Added" reverts on its own after a couple of seconds rather than staying there until the
  // shopper happens to touch the variant/qty controls again (the only other place it was cleared).
  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [justAdded]);

  // Pack rail: one row that scrolls sideways (client request, 2026-09-20 — the cards used to wrap
  // onto a second and third row on products with five or six packs). Arrows show only when there is
  // more in that direction.
  const updatePackRail = () => {
    const rail = packRailRef.current;
    if (!rail) return;
    setCanScrollPrev(rail.scrollLeft > 4);
    setCanScrollNext(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4);
  };
  useEffect(() => {
    updatePackRail();
    const rail = packRailRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updatePackRail);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [variants.length]);

  // Keep the chosen pack in view when it changes by keyboard (arrow keys move through the radios).
  const selectedIndex = variants.findIndex((v) => v.id === selected?.id);
  useEffect(() => {
    const rail = packRailRef.current;
    const card = packCardRefs.current[selectedIndex];
    if (!rail || !card) return;
    const left = card.offsetLeft - rail.offsetLeft;
    const right = left + card.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollTo({ left: left - 4, behavior: "smooth" });
    else if (right > rail.scrollLeft + rail.clientWidth) rail.scrollTo({ left: right - rail.clientWidth + 4, behavior: "smooth" });
  }, [selectedIndex]);

  const scrollPackRail = (direction: 1 | -1) => {
    const rail = packRailRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.75, behavior: "smooth" });
  };

  if (!selected) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{productName}</h1>
        {/* Review stars sit directly under the title (reference: blueteaindia.co.in's PDP
         * structure) — real star fill from `reviewAverage`, never rendered at all when there are
         * no reviews yet (CLAUDE.md §8: no fabricated rating). */}
        {reviewCount > 0 ? (
          <a href="#reviews" className="mt-2 inline-flex items-center gap-2 hover:opacity-80">
            <Rating value={reviewAverage} />
            <span className="text-sm text-ink-2 underline underline-offset-4">
              {reviewCount} review{reviewCount === 1 ? "" : "s"}
            </span>
          </a>
        ) : (
          <p className="mt-2 text-sm text-ink-2">No reviews yet</p>
        )}
      </div>

      {/* `key` remounts this on every variant switch, re-triggering the entrance animation as a
          "price just refreshed" cue — cheaper and more reliable than hand-tracking a "did the
          price change" flag, and scoped to just this one PDP instance rather than the shared
          PriceBlock component (used unanimated on every shop/cart card). */}
      <div key={selected.id} className="animate-[card-in_320ms_cubic-bezier(.16,1,.3,1)_both]">
        <PriceBlock mrpPaise={selected.mrpPaise} pricePaise={selected.pricePaise} size="lg" />
      </div>

      {variants.length > 1 && (
        // `min-w-0`: a <fieldset> defaults to `min-inline-size: min-content`, so without it the
        // one-row pack rail below stretches the fieldset (and the page) to its full content width
        // instead of scrolling — the phone page grew to 656px wide.
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold text-ink">{optionLabel}</legend>
          {/* Tall rectangular cards (client request, 2026-09-17), not pills: selected uses the
           * brand's citrus/gold yellow with dark ink text — never white on citrus, which fails
           * contrast outright (CLAUDE.md §5.6's hard floor). The real "best value" tier (computed
           * above, never a fixed/guessed one) gets a continuously running gold border. */}
          {/* `pt-3` keeps the "Best Value" badge (which sits across a card's top edge) inside the
              scroll area, which would otherwise clip it; `pb-2`/`px-1` do the same for focus rings. */}
          <div className="relative -mx-1">
          <div
            ref={packRailRef}
            role="radiogroup"
            aria-label={optionLabel}
            onScroll={updatePackRail}
            className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {variants.map((v, i) => {
              const checked = v.id === selected.id;
              const isBestValue = v.id === bestValueVariantId;
              // A variant with its own real pack photo (e.g. Blue Tea loose's 2-pack/4-pack)
              // takes priority over the product's shared primary image — client request,
              // 2026-09-17: "add the pack image above the variant ... matching the width of the
              // full variant". Falls back to the shared photo so every card still gets one.
              const cardImageUrl = v.imageUrl ?? imageUrl;
              return (
                <label
                  key={v.id}
                  ref={(el) => {
                    packCardRefs.current[i] = el;
                  }}
                  className={cn(
                    // No overflow-hidden here: it clipped the "Best Value" badge that sits across
                    // the top edge. The image clips its own corners instead (below).
                    "relative flex w-24 shrink-0 snap-start cursor-pointer flex-col items-center rounded-md border-2 text-center transition-colors duration-[180ms] sm:w-28",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brew-2 has-[:focus-visible]:ring-offset-2",
                    !v.inStock && "opacity-50",
                    checked ? "border-citrus bg-citrus text-ink" : "border-line bg-surface text-ink-2 hover:border-ink-3",
                    isBestValue && "best-value-border",
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={v.optionValue}
                    checked={checked}
                    onChange={() => selectVariant(v.id)}
                    className="sr-only"
                  />
                  {isBestValue && (
                    <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Best Value
                    </span>
                  )}
                  {checked && (
                    <span className="absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-full bg-ink text-white">
                      <svg viewBox="0 0 16 16" fill="none" className="size-2.5" aria-hidden="true">
                        <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                  {cardImageUrl && (
                    <span className="block w-full overflow-hidden rounded-t-[10px]">
                      <img
                        src={cardImageUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-20 w-full object-cover sm:h-24"
                      />
                    </span>
                  )}
                  <span className="flex flex-col items-center gap-1 px-2 py-2">
                    <span className="text-sm font-semibold leading-tight text-ink">{v.optionValue}</span>
                    <span className={cn("text-xs tabular-nums", checked ? "text-ink/80" : "text-ink-3")}>{formatINR(v.pricePaise)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <PackRailButton direction="prev" visible={canScrollPrev} onClick={() => scrollPackRail(-1)} />
          <PackRailButton direction="next" visible={canScrollNext} onClick={() => scrollPackRail(1)} />
          </div>
        </fieldset>
      )}

      <p className="-mt-1 text-xs text-ink-2" data-testid="buybox-sku">
        SKU: {selected.sku}
      </p>

      <StockLine variant={selected} />

      <div className="flex items-center gap-2 sm:gap-3">
        <QuantityStepper value={qty} onChange={changeQty} aria-label="Quantity" />
        <Button
          variant="gradient"
          size="lg"
          className="min-w-0 flex-1 overflow-hidden text-ellipsis"
          disabled={!selected.inStock}
          onClick={() => {
            if (!payload) return;
            onAddToCart?.(payload);
            setJustAdded(true);
          }}
        >
          {justAdded ? (
            <span key="added" className="flex items-center gap-1.5 animate-[card-in_220ms_cubic-bezier(.16,1,.3,1)_both]">
              <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
                <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Added
            </span>
          ) : (
            "Add to cart"
          )}
        </Button>
        <button
          type="button"
          onClick={toggleWishlist}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`}
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line text-ink hover:bg-surface-2 sm:size-11"
        >
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path
              d="M10 17s-6.5-4.06-8.2-7.86C.6 6.6 2 3.5 5.2 3.1c1.9-.24 3.5.9 4.8 2.6 1.3-1.7 2.9-2.84 4.8-2.6 3.2.4 4.6 3.5 3.4 6.04C16.5 12.94 10 17 10 17Z"
              fill={wishlisted ? "var(--color-hibiscus)" : "none"}
              stroke={wishlisted ? "var(--color-hibiscus)" : "currentColor"}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <TrustBadgeRow freeShippingThresholdPaise={freeShippingThresholdPaise} />

      <p className="text-xs text-ink-2">Inclusive of all taxes (GST).</p>

      {/* Not visually rendered — the live add-to-cart payload as JSON, so an automated keyboard/
       * interaction test can verify variant switching updates it with no navigation, per Phase 4's
       * acceptance criteria, without needing a real cart store (Phase 5) to inspect. */}
      <span className="sr-only" data-testid="add-to-cart-payload" aria-hidden="true">
        {JSON.stringify(payload)}
      </span>
    </div>
  );
}

/** Left/right control over the edge of the pack rail, fading the cards beneath it. Hidden (and out
 * of the tab order) when the rail can't scroll that way — keyboard users move through the packs with
 * the radio group's own arrow keys. */
function PackRailButton({ direction, visible, onClick }: { direction: "prev" | "next"; visible: boolean; onClick: () => void }) {
  const prev = direction === "prev";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 flex items-center transition-opacity duration-[180ms]",
        prev ? "left-0 bg-linear-to-r from-bg via-bg/80 to-transparent pr-6" : "right-0 bg-linear-to-l from-bg via-bg/80 to-transparent pl-6",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        tabIndex={-1}
        aria-hidden="true"
        className={cn(
          "flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-surface-2",
          visible && "pointer-events-auto",
        )}
      >
        <svg viewBox="0 0 20 20" fill="none" className={cn("size-4", !prev && "rotate-180")} aria-hidden="true">
          <path d="M12.5 15 7.5 10l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
