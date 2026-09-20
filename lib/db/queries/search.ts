import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../index";
import { notGiftOnly } from "./gift-only";
import { collections, productImages, products, variants } from "../schema";
import { paise } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";
import type { ProductCardData } from "@/types/catalog";

/**
 * `/search?q=` (PROMPTS.md Phase 3 item 6) over product name, tags and short description, using
 * plain Postgres `ILIKE` (substring matches, e.g. "tea" inside "Blue Tea") plus `pg_trgm`
 * `similarity()` (typo-tolerant fuzzy matches, e.g. "buttrfly" still finding "Butterfly Pea
 * Flower") — no external search service for a 20-product catalogue. `pg_trgm` is enabled by
 * migration 0001_enable_pg_trgm.sql; Supabase Postgres ships the extension, so this same query
 * runs unchanged in production. Ranked by the best of the two similarity scores (name weighted
 * over description), then by CLAUDE.md §7.2 priority as the tiebreak.
 */
export async function searchProducts(query: string): Promise<ProductCardData[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  return unstable_cache(() => fetchSearchProducts(q), ["search-products", q], {
    tags: ["products"],
  })();
}

async function fetchSearchProducts(q: string): Promise<ProductCardData[]> {
  const like = `%${q}%`;
  const nameSimilarity = sql<number>`similarity(${products.name}, ${q})`;
  const descSimilarity = sql<number>`similarity(coalesce(${products.shortDescription}, ''), ${q})`;
  const tagMatch = sql`exists (select 1 from unnest(${products.tags}) t where t ilike ${like})`;
  const rank = sql<number>`greatest(${nameSimilarity}, ${descSimilarity} * 0.6)`;

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
      variantsJson: sql<VariantJsonRow[]>`coalesce(
        json_agg(
          json_build_object(
            'id', ${variants.id}, 'productId', ${variants.productId}, 'sku', ${variants.sku},
            'optionValue', ${variants.optionValue}, 'mrpPaise', ${variants.mrpPaise},
            'pricePaise', ${variants.pricePaise}, 'weightGrams', ${variants.weightGrams},
            'inStock', ${variants.inStock}, 'stockQty', ${variants.stockQty}, 'position', ${variants.position}
          ) order by ${variants.position}
        ) filter (where ${variants.id} is not null),
        '[]'
      )`,
      // See lib/db/queries/shop.ts's identical subquery for why this is a correlated subquery
      // rather than a second left-join (would cross-multiply against the variants join above).
      imagesJson: sql<ImageJsonRow[]>`coalesce(
        (
          select json_agg(
            json_build_object(
              'storageKey', ${productImages.storageKey}, 'alt', ${productImages.alt},
              'width', ${productImages.width}, 'height', ${productImages.height}
            )
            order by ${productImages.isPrimary} desc, ${productImages.position}
          )
          from ${productImages}
          where ${productImages.productId} = ${products.id}
        ),
        '[]'
      )`,
    })
    .from(products)
    .innerJoin(collections, eq(products.collectionId, collections.id))
    .leftJoin(variants, and(eq(variants.productId, products.id), notGiftOnly))
    .where(
      and(
        eq(products.status, "published"),
        sql`(
          ${products.name} ilike ${like}
          or coalesce(${products.shortDescription}, '') ilike ${like}
          or ${tagMatch}
          or ${nameSimilarity} > 0.2
          or ${descSimilarity} > 0.2
        )`,
      ),
    )
    .groupBy(products.id, collections.slug, collections.title)
    .orderBy(sql`${rank} desc`, products.priority);

  return rows.map((r) => ({
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
    variants: r.variantsJson.map((v) => ({ ...v, mrpPaise: paise(v.mrpPaise), pricePaise: paise(v.pricePaise), imageUrl: null })),
    images: r.imagesJson.map((img) => ({ url: publicUrl(img.storageKey), alt: img.alt, width: img.width, height: img.height })),
  }));
}

interface VariantJsonRow {
  id: number;
  productId: number;
  sku: string;
  optionValue: string;
  mrpPaise: number;
  pricePaise: number;
  weightGrams: number | null;
  inStock: boolean;
  stockQty: number | null;
  position: number;
}

interface ImageJsonRow {
  storageKey: string;
  alt: string;
  width: number;
  height: number;
}
