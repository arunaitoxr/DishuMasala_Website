"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Rating } from "@/components/ui/Rating";
import { Placeholder } from "@/components/media/Placeholder";
import { QuickAddDialog, type QuickAddVariant } from "@/components/product/QuickAddDialog";
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
  /** The product's own `tags` column. */
  tags?: string[];
  /** The product's own `option_label` ("Size" | "Combo" | "Teabags") plus the distinct variant
   * option values (e.g. ["100g", "250g"]) — never invented, straight off the product's variants. */
  optionLabel: string;
  optionValues: string[];
  /** The representative (position-0) variant's prices — what the card shows when there is only
   * one option, and the fallback when `variants` isn't passed (/design-system's examples). */
  mrpPaise: Paise;
  pricePaise: Paise;
  /** Every real variant, in position order. When there is more than one, the card shows the
   * lowest price as "From ₹X" and "Add to cart" opens a pack picker instead of guessing a pack. */
  variants?: QuickAddVariant[];
  /** 0, 1, or 2+ images, in position order, primary first. */
  images?: ProductCardImage[];
  /** The product's own `priority` (CLAUDE.md §7.2) — carried into the cart line the same way the
   * PDP does. */
  priority: number;
  /** The position-0 variant. Undefined when the product has no variant yet (mid-edit in the admin)
   * or for /design-system's synthetic examples; the button disables itself in that case. */
  primaryVariant?: { id: number; sku: string; optionValue: string; inStock: boolean };
  /** Omit entirely (not 0) when there is no review data — never a fabricated rating. */
  rating?: { value: number; count: number };
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
  /** Overrides the real add-to-cart behaviour — only used by /design-system's synthetic examples. */
  onQuickAdd?: () => void;
  className?: string;
}

/** "5 sizes" / "3 options" — how many packs the picker will offer, so a multi-pack card carries
 * the same meta row a single-pack card does ("100 gm x 3") and every card in a grid lines up. */
function optionCountLabel(optionLabel: string, count: number): string {
  return `${count} ${optionLabel.toLowerCase() === "size" ? "sizes" : "options"}`;
}

/**
 * The one product card used by every grid and carousel on the storefront. Built to the reference
 * site's discipline (client brief: bluetea.co.in's consistency): every card has the same rows in the
 * same order — image, name, pack, rating, price, "Add to cart" — whatever the product. A product
 * with several packs shows its real lowest price as "From ₹X" and opens a pack picker from the same
 * button, rather than rendering a different, quieter card with no price at all.
 */
export function ProductCard({
  productId,
  slug,
  name,
  optionLabel,
  optionValues,
  mrpPaise,
  pricePaise,
  variants,
  images = [],
  priority,
  primaryVariant,
  rating,
  wishlisted,
  onToggleWishlist,
  onQuickAdd,
  className,
}: ProductCardProps) {
  const real = useWishlistToggle(productId);
  const wishlistedState = wishlisted ?? real.wishlisted;
  const [primary, secondary] = images;
  const href = `/product/${slug}/`;
  const addItem = useCartStore((s) => s.addItem);
  const [pickerOpen, setPickerOpen] = useState(false);
  const nameId = useId();

  const optionCount = variants?.length ?? optionValues.length;
  const hasOptions = optionCount > 1;

  // "From" price: the lowest real price among in-stock packs (falling back to all packs when none
  // are in stock), with that same pack's MRP so the Save % chip is that pack's genuine saving.
  const pricedVariants = variants?.filter((v) => v.inStock).length ? variants.filter((v) => v.inStock) : variants;
  const cheapest =
    hasOptions && pricedVariants && pricedVariants.length > 0
      ? pricedVariants.reduce((a, b) => (b.pricePaise < a.pricePaise ? b : a))
      : undefined;
  const shownMrp = hasOptions && cheapest ? cheapest.mrpPaise : mrpPaise;
  const shownPrice = hasOptions && cheapest ? cheapest.pricePaise : pricePaise;

  const anyInStock = variants ? variants.some((v) => v.inStock) : (primaryVariant?.inStock ?? true);
  const canAdd =
    onQuickAdd != null || (productId != null && anyInStock && (hasOptions ? (variants?.length ?? 0) > 1 : primaryVariant != null));

  const toggleWishlist = () => {
    if (onToggleWishlist) onToggleWishlist();
    else real.toggle();
  };

  const add = (variant: { id: number; sku: string; optionValue: string; mrpPaise: Paise; pricePaise: Paise }) => {
    if (productId == null) return;
    void addItem({
      variantId: variant.id,
      productId,
      priority,
      qty: 1,
      productName: name,
      optionValue: variant.optionValue,
      sku: variant.sku,
      mrpPaise: variant.mrpPaise,
      unitPricePaise: variant.pricePaise,
      imageUrl: primary?.url ?? null,
    });
  };

  const onAddClick = () => {
    if (onQuickAdd) return onQuickAdd();
    if (hasOptions) return setPickerOpen(true);
    if (primaryVariant) add({ ...primaryVariant, mrpPaise, pricePaise });
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg bg-surface shadow-card",
        "transition-[box-shadow,transform] duration-[200ms] ease-[cubic-bezier(.2,.6,.2,1)]",
        "hover:-translate-y-0.5 hover:shadow-lift focus-within:-translate-y-0.5 focus-within:shadow-lift",
        className,
      )}
    >
      <div className="relative w-full overflow-hidden bg-surface-2" style={{ aspectRatio: "1 / 1" }}>
        <Link href={href} className="absolute inset-0 z-10" aria-label={name}>
          <span className="sr-only">View {name}</span>
        </Link>

        {primary ? (
          // eslint-disable-next-line @next/next/no-img-element -- already-sized storage derivatives; next/image adds nothing here.
          <img
            src={primary.url}
            alt={primary.alt}
            width={primary.width}
            height={primary.height}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Placeholder slot="product-packshot-generic" className="absolute inset-0 h-full w-full" />
        )}

        {secondary && (
          // eslint-disable-next-line @next/next/no-img-element -- see above.
          <img
            src={secondary.url}
            alt=""
            aria-hidden="true"
            width={secondary.width}
            height={secondary.height}
            loading="lazy"
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

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <Link
          id={nameId}
          href={href}
          title={name}
          className="line-clamp-2 min-h-[2.75em] font-sans text-[0.95rem] font-semibold leading-snug tracking-[-0.01em] text-ink hover:underline sm:text-[1.05rem]"
        >
          {name}
        </Link>

        {optionCount > 0 && (
          <span className="w-fit rounded-sm border border-line px-2 py-0.5 text-xs font-medium text-ink-2">
            {hasOptions ? optionCountLabel(optionLabel, optionCount) : optionValues[0]}
          </span>
        )}

        {/* The rating row is always reserved, so cards with and without reviews keep their price
            and button on the same line in a grid row. Nothing is drawn when there are no reviews —
            an empty star row would read as a real (low) rating. */}
        <div className="min-h-4">{rating && <Rating value={rating.value} count={rating.count} />}</div>

        <div className="mt-auto flex flex-col gap-3 pt-1">
          <PriceBlock mrpPaise={shownMrp} pricePaise={shownPrice} prefix={hasOptions ? "From" : undefined} />
          <Button
            type="button"
            variant="gradient"
            size="sm"
            onClick={onAddClick}
            disabled={!canAdd}
            aria-haspopup={hasOptions ? "dialog" : undefined}
            aria-describedby={nameId}
            className="relative z-20 w-full"
          >
            {anyInStock ? "Add to cart" : "Out of stock"}
          </Button>
        </div>
      </div>

      {hasOptions && variants && (
        <QuickAddDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          productName={name}
          optionLabel={optionLabel}
          href={href}
          variants={variants}
          onAdd={(variant) => {
            add(variant);
            setPickerOpen(false);
          }}
        />
      )}
    </article>
  );
}
