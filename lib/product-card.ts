/**
 * Pure presentation mapping from a queried product (types/catalog.ts's `ProductCardData`, read by
 * lib/db/queries/products.ts) to `components/product/ProductCard.tsx`'s props. No drizzle import —
 * safe for any section component to call directly — and no invented data: the representative
 * variant is always the product's own position-0 variant (data/catalog.json's declared order),
 * never a hardcoded price or name.
 */
import { paise } from "@/lib/money";
import type { ProductCardData } from "@/types/catalog";
import type { ProductCardProps } from "@/components/product/ProductCard";

export function toProductCardProps(product: ProductCardData): ProductCardProps {
  const primary = product.variants[0];

  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    collectionSlug: product.collectionSlug,
    collectionTitle: product.collectionTitle,
    tags: product.tags,
    optionLabel: product.optionLabel,
    optionValues: product.variants.map((v) => v.optionValue),
    // Every seeded product has at least one variant, but a product published with none yet
    // (e.g. mid-edit in the admin, later phases) must still render a card rather than throw.
    mrpPaise: primary?.mrpPaise ?? paise(0),
    pricePaise: primary?.pricePaise ?? paise(0),
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      optionValue: v.optionValue,
      mrpPaise: v.mrpPaise,
      pricePaise: v.pricePaise,
      inStock: v.inStock,
    })),
    images: product.images,
    priority: product.priority,
    // Undefined (not a fake variant) when the product genuinely has none yet — ProductCard
    // disables Quick Add rather than adding a variant that doesn't exist.
    primaryVariant: primary
      ? { id: primary.id, sku: primary.sku, optionValue: primary.optionValue, inStock: primary.inStock }
      : undefined,
    rating: product.rating,
  };
}
