import "server-only";

import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../index";
import { notGiftOnly } from "./gift-only";
import { collections, productImages, products, reviews, variants } from "../schema";
import { paise } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";
import type { ProductCardData, ProductThumbnail } from "@/types/catalog";

/**
 * Published products in one collection, each with its full variant list (ordered by position) and
 * its parent collection's slug/title denormalised alongside it — one round trip, everything the
 * homepage sections (components/sections/*) and ProductCard need, so none of them import drizzle or
 * query lib/db directly (CLAUDE.md §3.2).
 *
 * Ordered by the product's own `priority`, then `id` as a stable, non-invented tiebreak — the seed
 * data gives every product in a collection the same priority (its collection's rank), so `id` (insert
 * order from data/catalog.json) is what actually determines display order within the collection.
 *
 * Cached per collection with `unstable_cache` on the `products` and `collection:<slug>` tags
 * (CLAUDE.md §3.4) — an admin mutation that changes this collection's products must call
 * `revalidateTag("collection:<slug>")` (and/or "products") for the storefront to pick it up.
 */
export async function getPublishedProductsByCollectionSlug(slug: string): Promise<ProductCardData[]> {
  return unstable_cache(() => fetchPublishedProductsByCollectionSlug(slug), ["products-by-collection-v2", slug], {
    tags: ["products", `collection:${slug}`],
  })();
}

async function fetchPublishedProductsByCollectionSlug(slug: string): Promise<ProductCardData[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      collectionId: products.collectionId,
      collectionSlug: collections.slug,
      collectionTitle: collections.title,
      shortDescription: products.shortDescription,
      description: products.description,
      ingredients: products.ingredients,
      brewGuide: products.brewGuide,
      tags: products.tags,
      optionLabel: products.optionLabel,
      priority: products.priority,
      status: products.status,
      seoTitle: products.seoTitle,
      seoDescription: products.seoDescription,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      variant: {
        id: variants.id,
        productId: variants.productId,
        sku: variants.sku,
        optionValue: variants.optionValue,
        mrpPaise: variants.mrpPaise,
        pricePaise: variants.pricePaise,
        weightGrams: variants.weightGrams,
        inStock: variants.inStock,
        stockQty: variants.stockQty,
        position: variants.position,
      },
    })
    .from(products)
    .innerJoin(collections, eq(products.collectionId, collections.id))
    .leftJoin(variants, and(eq(variants.productId, products.id), notGiftOnly))
    .where(and(eq(collections.slug, slug), eq(products.status, "published")))
    .orderBy(asc(products.priority), asc(products.id), asc(variants.position));

  const bySlug = new Map<string, ProductCardData>();

  for (const r of rows) {
    let product = bySlug.get(r.slug);
    if (!product) {
      product = {
        id: r.id,
        slug: r.slug,
        name: r.name,
        collectionId: r.collectionId,
        collectionSlug: r.collectionSlug,
        collectionTitle: r.collectionTitle,
        shortDescription: r.shortDescription,
        description: r.description,
        ingredients: r.ingredients,
        brewGuide: r.brewGuide,
        tags: r.tags,
        optionLabel: r.optionLabel,
        priority: r.priority,
        status: r.status,
        seoTitle: r.seoTitle,
        seoDescription: r.seoDescription,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        variants: [],
        images: [],
      };
      bySlug.set(r.slug, product);
    }
    if (r.variant && r.variant.id != null) {
      product.variants.push({
        ...r.variant,
        mrpPaise: paise(r.variant.mrpPaise),
        pricePaise: paise(r.variant.pricePaise),
        // Shop/collection cards never render the per-variant pack image (that's a PDP-only
        // BuyBox detail, sourced by lib/db/queries/product-detail.ts instead) — never selected
        // here, so always null rather than a second query this list never needs.
        imageUrl: null,
      });
    }
  }

  await attachImages(Array.from(bySlug.values()));
  const productsOut = Array.from(bySlug.values());
  await attachRatingSummaries(productsOut);
  return productsOut;
}

/**
 * Attaches each product's real migrated images (products.map((p) => p.images), mutated in place) —
 * a second, small query rather than a join, since joining product_images alongside the variants
 * left-join above would cross-multiply rows (one row per variant × image pair) and corrupt both
 * lists once re-grouped. Every ProductCardData producer in lib/db/queries/* attaches images this
 * same way (see product-detail.ts's getRelatedProducts) so cards actually show the real photo the
 * PDP already has, instead of always falling back to the generic placeholder.
 */
async function attachImages(productsOut: ProductCardData[]): Promise<void> {
  if (productsOut.length === 0) return;
  const ids = productsOut.map((p) => p.id);
  const imageRows = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, ids))
    .orderBy(desc(productImages.isPrimary), asc(productImages.position));

  const byProductId = new Map<number, ProductThumbnail[]>();
  for (const img of imageRows) {
    const list = byProductId.get(img.productId) ?? [];
    list.push({ url: publicUrl(img.storageKey), alt: img.alt, width: img.width, height: img.height });
    byProductId.set(img.productId, list);
  }
  for (const product of productsOut) {
    product.images = byProductId.get(product.id) ?? [];
  }
}

/** One grouped review query for the full shelf. A product with no approved reviews deliberately
 * receives no rating prop, so cards never display a made-up 0-star score. */
async function attachRatingSummaries(productsOut: ProductCardData[]): Promise<void> {
  if (productsOut.length === 0) return;
  const ids = productsOut.map((p) => p.id);
  const rows = await db
    .select({
      productId: reviews.productId,
      count: sql<number>`count(*)`,
      average: sql<number>`avg(${reviews.rating})`,
    })
    .from(reviews)
    .where(and(inArray(reviews.productId, ids), eq(reviews.status, "approved")))
    .groupBy(reviews.productId);

  const byProductId = new Map(rows.map((row) => [row.productId, { count: Number(row.count), value: Number(row.average) }]));
  for (const product of productsOut) {
    const rating = byProductId.get(product.id);
    if (rating) product.rating = rating;
  }
}
