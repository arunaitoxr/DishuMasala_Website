import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { notGiftOnly } from "./gift-only";
import { collections, products, variants } from "../schema";
import { paise } from "@/lib/money";
import type { CollectionSummary } from "@/types/catalog";

/**
 * All collections in priority order (CLAUDE.md §7.2: "Blue Tea first. Then Red Tea. Then
 * everything else... Lower sorts first, everywhere"), each annotated with its published product
 * count and sale-price range — a single round trip via one grouped query.
 */
export async function getCollectionsWithStats(): Promise<CollectionSummary[]> {
  const rows = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      title: collections.title,
      tagline: collections.tagline,
      priority: collections.priority,
      accentToken: collections.accentToken,
      position: collections.position,
      seoTitle: collections.seoTitle,
      seoDescription: collections.seoDescription,
      productCount: sql<number>`count(distinct ${products.id})`,
      minPricePaise: sql<number | null>`min(${variants.pricePaise})`,
      maxPricePaise: sql<number | null>`max(${variants.pricePaise})`,
    })
    .from(collections)
    .leftJoin(
      products,
      and(eq(products.collectionId, collections.id), eq(products.status, "published")),
    )
    .leftJoin(variants, and(eq(variants.productId, products.id), notGiftOnly))
    .groupBy(collections.id)
    .orderBy(asc(collections.priority));

  return rows.map((r) => ({
    ...r,
    productCount: Number(r.productCount),
    minPricePaise: r.minPricePaise == null ? null : paise(Number(r.minPricePaise)),
    maxPricePaise: r.maxPricePaise == null ? null : paise(Number(r.maxPricePaise)),
  }));
}

/** Every collection slug — `app/collections/[slug]/page.tsx`'s `generateStaticParams` (Phase 3),
 * so all 5 collection pages are statically known at build time without pulling the full stats
 * query just to read `slug`. */
export async function getAllCollectionSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: collections.slug }).from(collections);
  return rows.map((r) => r.slug);
}

/** A single collection by slug, with the same published-product-count/price-range stats
 * `getCollectionsWithStats` computes for the whole list — `app/collections/[slug]/page.tsx`'s
 * `generateMetadata` and page body. Returns null for an unknown slug (a 404, not a crash). */
export async function getCollectionBySlug(slug: string): Promise<CollectionSummary | null> {
  const [row] = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      title: collections.title,
      tagline: collections.tagline,
      priority: collections.priority,
      accentToken: collections.accentToken,
      position: collections.position,
      seoTitle: collections.seoTitle,
      seoDescription: collections.seoDescription,
      productCount: sql<number>`count(distinct ${products.id})`,
      minPricePaise: sql<number | null>`min(${variants.pricePaise})`,
      maxPricePaise: sql<number | null>`max(${variants.pricePaise})`,
    })
    .from(collections)
    .leftJoin(
      products,
      and(eq(products.collectionId, collections.id), eq(products.status, "published")),
    )
    .leftJoin(variants, and(eq(variants.productId, products.id), notGiftOnly))
    .where(eq(collections.slug, slug))
    .groupBy(collections.id)
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    productCount: Number(row.productCount),
    minPricePaise: row.minPricePaise == null ? null : paise(Number(row.minPricePaise)),
    maxPricePaise: row.maxPricePaise == null ? null : paise(Number(row.maxPricePaise)),
  };
}
