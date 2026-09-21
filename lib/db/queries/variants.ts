import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../index";
import { collections, productImages, products, variants } from "../schema";
import { paise, type Paise } from "@/lib/money";

/** Everything `lib/commerce/pricing.ts` needs to price one cart line, read fresh from Postgres —
 * never trusted from a caller (CLAUDE.md §7.5). */
export interface VariantPricingRow {
  variantId: number;
  productId: number;
  collectionId: number;
  /** The line's collection slug (e.g. "blue-tea", "spices") — joined here so pricing.ts can
   * classify Tea vs. Masala pillar membership (CLAUDE.md §7.2) without a second query. */
  collectionSlug: string;
  /** The product's slug — lets pricing.ts tell which teas a tea combo contains (lib/pillars.ts). */
  productSlug?: string;
  productName: string;
  /** The product's own priority (CLAUDE.md §7.2) — carried through pricing so display-only
   * consumers (cart upsells) can sort/filter by it without a second round trip. Never used for
   * any money computation. */
  priority: number;
  sku: string;
  optionValue: string;
  mrpPaise: Paise;
  pricePaise: Paise;
  inStock: boolean;
  stockQty: number | null;
  imageStorageKey: string | null;
}

/**
 * The one place a variant's price is read for money maths — `lib/commerce/pricing.ts` calls this
 * (via its default deps), never a caller-supplied price. Two round trips (variant+product, then
 * each product's primary image), never N+1 per line.
 */
export async function getVariantsForPricing(ids: number[]): Promise<VariantPricingRow[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];

  const rows = await db
    .select({
      variantId: variants.id,
      productId: variants.productId,
      collectionId: products.collectionId,
      collectionSlug: collections.slug,
      productSlug: products.slug,
      productName: products.name,
      priority: products.priority,
      sku: variants.sku,
      optionValue: variants.optionValue,
      mrpPaise: variants.mrpPaise,
      pricePaise: variants.pricePaise,
      inStock: variants.inStock,
      stockQty: variants.stockQty,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(collections, eq(collections.id, products.collectionId))
    .where(inArray(variants.id, uniqueIds));

  const productIds = Array.from(new Set(rows.map((r) => r.productId)));
  const images = productIds.length
    ? await db
        .select({ productId: productImages.productId, storageKey: productImages.storageKey })
        .from(productImages)
        .where(and(inArray(productImages.productId, productIds), eq(productImages.isPrimary, true)))
    : [];
  const imageByProduct = new Map(images.map((i) => [i.productId, i.storageKey]));

  return rows.map((r) => ({
    ...r,
    mrpPaise: paise(r.mrpPaise),
    pricePaise: paise(r.pricePaise),
    imageStorageKey: imageByProduct.get(r.productId) ?? null,
  }));
}
