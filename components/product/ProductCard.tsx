"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Rating } from "@/components/ui/Rating";
import { Placeholder } from "@/components/media/Placeholder";
import { familyAccentVar, resolveFamilyAccent } from "@/lib/family-accent";
import { useWishlistToggle } from "@/lib/hooks/useWishlistToggle";
import { useCartStore } from "@/lib/store/cart";
import { cn } from "@/lib/cn";
import type { Paise } from "@/lib/money";

export interface ProductCardImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProductCardProps {
  /** The product's numeric id — real card usages (lib/product-card.ts) always pass it; only the
   * /design-system showcase omits it, since its examples aren't real products and have nothing to
   * wishlist against. */
  productId?: number;
  slug: string;
  name: string;
  collectionSlug: string;
  collectionTitle: string;
  /** The product's own `tags` column — feeds the family-accent resolver for spice products. */
  tags?: string[];
  /** The product's own `option_label` ("Size" | "Combo" | "Teabags") plus the distinct variant
   * option values (e.g. ["100g", "250g"]) — never invented, straight off the product's variants. */
  optionLabel: string;
  optionValues: string[];
  mrpPaise: Paise;
  pricePaise: Paise;
  /** 0, 1, or 2+ images, in position order, primary first. Degrades gracefully at every count —
   * roughly half the seeded catalogue is single-image, single-variant. */
  images?: ProductCardImage[];
  /** The product's own `priority` (CLAUDE.md §7.2) — required for real cards (lib/product-card.ts
   * always sets it) so Quick Add can carry it into the cart line the same way the PDP does; the
   * /design-system showcase's synthetic examples pass a placeholder value since they have no real
   * cart line to add. */
  priority: number;
  /** The variant Quick Add actually adds — the product's own position-0 variant, matching
   * lib/product-card.ts's `mrpPaise`/`pricePaise`. Undefined when the product has no variant yet
   * (mid-edit in the admin) or for /design-system's synthetic examples; Quick Add disables itself
   * in that case rather than adding a variant that doesn't exist. */
  primaryVariant?: { id: number; sku: string; optionValue: string; inStock: boolean };
  /** Omit entirely (not 0) when there is no review data yet — there are no reviews at launch. */
  rating?: { value: number; count: number };
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
  /** Overrides the real add-to-cart behaviour below — only used by /design-system's synthetic
   * examples, which have no real `primaryVariant` to add. */
  onQuickAdd?: () => void;
  className?: string;
}

export function ProductCard({
  productId,
  slug,
  name,
  collectionSlug,
  collectionTitle,
  tags = [],
  optionLabel,
  optionValues,
  mrpPaise,
  pricePaise,
  images = [],
  priority,
  primaryVariant,
  rating,
  wishlisted,
  onToggleWishlist,
  onQuickAdd,
  className,
}: ProductCardProps) {
  // Real wishlist state (PROMPTS.md Phase 6 item 4) when a productId is known; the `wishlisted`/
  // `onToggleWishlist` props stay as an explicit override for callers that want to control it
  // themselves (e.g. a future admin preview), and as the fallback for /design-system's synthetic
  // examples, which have no real product to wishlist against.
  const real = useWishlistToggle(productId);
  const wishlistedState = wishlisted ?? real.wishlisted;
  const accent = familyAccentVar(resolveFamilyAccent(collectionSlug, tags));
  const [primary, secondary] = images;
  const href = `/product/${slug}/`;
  const addItem = useCartStore((s) => s.addItem);
  // A card has no safe way to infer which of several options a shopper meant. Sending a shopper
  // to the PDP for an explicit selection is clearer than silently adding the first pack size.
  const requiresOptionSelection = optionValues.length > 1;

  const toggleWishlist = () => {
    if (onToggleWishlist) {
      onToggleWishlist();
    } else {
      real.toggle();
    }
  };

  // Real add-to-cart (same lib/store/cart.ts action the PDP's "Add to cart" uses, which also
  // opens the cart drawer for feedback) — every card on the homepage/shop/carousels used to render
  // a "Quick add" button with no `onQuickAdd` ever wired up anywhere, so clicking it did nothing.
  const canQuickAdd = !requiresOptionSelection && (onQuickAdd != null || (primaryVariant != null && productId != null && primaryVariant.inStock));
  const quickAdd = () => {
    if (onQuickAdd) {
      onQuickAdd();
      return;
    }
    if (!primaryVariant || productId == null) return;
    void addItem({
      variantId: primaryVariant.id,
      productId,
      priority,
      qty: 1,
      productName: name,
      optionValue: primaryVariant.optionValue,
      sku: primaryVariant.sku,
      mrpPaise,
      unitPricePaise: pricePaise,
      imageUrl: primary?.url ?? null,
    });
  };

  return (
    <article
      className={cn(
        // text-align-normal (app/globals.css): the site-wide justified-body-copy rule explicitly
        // excludes product cards — short labels (name, option chips, price) read worse justified.
        "text-align-normal group relative flex flex-col overflow-hidden rounded-lg bg-surface shadow-card",
        "transition-[box-shadow,transform] duration-[200ms] ease-[cubic-bezier(.2,.6,.2,1)]",
        "hover:-translate-y-0.5 hover:shadow-lift focus-within:-translate-y-0.5 focus-within:shadow-lift",
        className,
      )}
    >
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1 / 1" }}>
        <Link href={href} className="absolute inset-0 z-10" aria-label={name}>
          <span className="sr-only">View {name}</span>
        </Link>

        {primary ? (
          // eslint-disable-next-line @next/next/no-img-element -- placeholder-free real image path; next/image wiring lands with real catalogue data in Phase 3.
          <img
            src={primary.url}
            alt={primary.alt}
            width={primary.width}
            height={primary.height}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Placeholder slot="product-packshot-generic" className="absolute inset-0 h-full w-full" />
        )}

        {secondary && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={secondary.url}
            alt=""
            aria-hidden="true"
            width={secondary.width}
            height={secondary.height}
            className={cn(
              "absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200",
              "group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          />
        )}

        <button
          type="button"
          onClick={toggleWishlist}
          aria-pressed={wishlistedState}
          aria-label={wishlistedState ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
          className="absolute right-2.5 top-2.5 z-20 flex size-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-card backdrop-blur-sm"
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
            <path
              d="M10 17s-6.5-4.06-8.2-7.86C.6 6.6 2 3.5 5.2 3.1c1.9-.24 3.5.9 4.8 2.6 1.3-1.7 2.9-2.84 4.8-2.6 3.2.4 4.6 3.5 3.4 6.04C16.5 12.94 10 17 10 17Z"
              fill={wishlistedState ? "var(--color-hibiscus)" : "none"}
              stroke={wishlistedState ? "var(--color-hibiscus)" : "currentColor"}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
          {collectionTitle}
        </span>

        <Link href={href} className="font-sans text-[1.05rem] font-semibold leading-snug text-ink tracking-[-0.01em] hover:underline">
          {name}
        </Link>

        {/* Client request (2026-09-17): a product with more than one real variant hides its price
         * and option chips everywhere EXCEPT the product page itself — the price/size genuinely
         * depends on which variant the shopper picks, and this component is never rendered on the
         * PDP (that page uses BuyBox/PriceBlock directly), so gating on `optionValues.length > 1`
         * here is exactly "everywhere but the product page." A single-variant product has no such
         * ambiguity, so its one real price still shows. */}
        {optionValues.length > 0 && optionValues.length <= 1 && (
          <div className="flex flex-wrap gap-1.5" aria-label={optionLabel}>
            {optionValues.map((v) => (
              <span
                key={v}
                className="rounded-sm border border-line px-2 py-0.5 text-xs font-medium text-ink-2"
              >
                {v}
              </span>
            ))}
          </div>
        )}

        {rating && <Rating value={rating.value} count={rating.count} />}

        {/* `mt-auto` moved onto this wrapper (not just the price block) so a multi-variant card,
         * which renders no price above, still bottom-aligns its Quick add button with every
         * single-variant card in the same grid row — otherwise the button would float right under
         * the name/rating instead of at the card's bottom edge. */}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          {optionValues.length <= 1 && <PriceBlock mrpPaise={mrpPaise} pricePaise={pricePaise} />}

          {/* Uses the shared Button rather than a hand-rolled <button> (changed 2026-09-17): adding
           * to the cart is the same intent here as it is in BuyBox, so it now carries the same
           * `gradient` treatment instead of a quieter outline. Going through the component also
           * restores what the bespoke markup had dropped — the system focus ring, `active:scale`,
           * the shared size scale and disabled handling. `relative z-20` stays: the whole card is
           * covered by a stretched link overlay, and the button has to sit above it to stay
           * clickable. */}
          {requiresOptionSelection ? (
            <Button asChild variant="outline" size="sm" className="relative z-20 w-full">
              <Link href={href}>Choose {optionLabel.toLowerCase()}</Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="gradient"
              size="sm"
              onClick={quickAdd}
              disabled={!canQuickAdd}
              className="relative z-20 w-full"
            >
              {primaryVariant && !primaryVariant.inStock ? "Out of stock" : "Add to cart"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
