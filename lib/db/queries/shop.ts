import "server-only";

import { and, asc, eq, exists, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../index";
import { notGiftOnly } from "./gift-only";
import { collections, productImages, products, reviews, variants } from "../schema";
import { paise } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";
import type { ProductCardData } from "@/types/catalog";
import {
  buildShopOrderBy,
  buildShopWhereConditions,
  SHOP_OPTION_LABELS,
  SHOP_PAGE_SIZE,
  type ShopFilters,
  type ShopOptionLabel,
} from "./shop-query";

export interface ShopPage {
  products: ProductCardData[];
  totalCount: number;
  totalPages: number;
  page: number;
}

/**
 * The default/filtered/sorted `/shop` listing — one round trip to Postgres. `json_agg` embeds each
 * product's variants directly in its own row (no per-product follow-up query for variants/images —
 * PROMPTS.md Phase 3's explicit "not one query for products and a separate query per product"),
 * and `count(*) over()` returns the total number of matching products (post-filter, pre-LIMIT) in
 * that same row set, so pagination needs no second COUNT query either.
 *
 * Cached with `unstable_cache`, keyed on the fully-serialised filter set — CLAUDE.md §3.4: any
 * admin mutation that changes published products/variants must `revalidateTag("products")` for
 * every one of these cached filter combinations to pick it up.
 */
export async function getShopPage(filters: ShopFilters): Promise<ShopPage> {
  const cacheKey = JSON.stringify(filters);
  const tags = ["products", ...(filters.collection ? [`collection:${filters.collection}`] : [])];
  return unstable_cache(() => fetchShopPage(filters), ["shop-page-v2", cacheKey], { tags })();
}

async function fetchShopPage(filters: ShopFilters): Promise<ShopPage> {
  const whereConditions = buildShopWhereConditions(filters);
  const orderBy = buildShopOrderBy(filters.sort);
  const offset = (filters.page - 1) * SHOP_PAGE_SIZE;

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
            'id', ${variants.id},
            'productId', ${variants.productId},
            'sku', ${variants.sku},
            'optionValue', ${variants.optionValue},
            'mrpPaise', ${variants.mrpPaise},
            'pricePaise', ${variants.pricePaise},
            'weightGrams', ${variants.weightGrams},
            'inStock', ${variants.inStock},
            'stockQty', ${variants.stockQty},
            'position', ${variants.position}
          )
          order by ${variants.position}
        ) filter (where ${variants.id} is not null),
        '[]'
      )`,
      // A correlated subquery, not a second left-join — joining product_images alongside the
      // variants left-join above would cross-multiply rows (one per variant × image pair) and
      // corrupt the variants json_agg too. Ordered primary-first, then by position.
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
      ratingCount: sql<number>`(
        select count(*) from ${reviews}
        where ${reviews.productId} = ${products.id} and ${reviews.status} = 'approved'
      )`,
      ratingAverage: sql<number | null>`(
        select avg(${reviews.rating}) from ${reviews}
        where ${reviews.productId} = ${products.id} and ${reviews.status} = 'approved'
      )`,
      totalCount: sql<number>`count(*) over()`,
    })
    .from(products)
    .innerJoin(collections, eq(products.collectionId, collections.id))
    .leftJoin(variants, and(eq(variants.productId, products.id), notGiftOnly))
    .where(and(...whereConditions))
    .groupBy(products.id, collections.slug, collections.title)
    .orderBy(...orderBy)
    .limit(SHOP_PAGE_SIZE)
    .offset(offset);

  const totalCount = rows[0]?.totalCount ? Number(rows[0].totalCount) : 0;

  const productsOut: ProductCardData[] = rows.map((r) => ({
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
    variants: r.variantsJson.map((v) => ({
      ...v,
      mrpPaise: paise(v.mrpPaise),
      pricePaise: paise(v.pricePaise),
      imageUrl: null,
    })),
    images: r.imagesJson.map((img) => ({ url: publicUrl(img.storageKey), alt: img.alt, width: img.width, height: img.height })),
    ...(Number(r.ratingCount) > 0 && r.ratingAverage != null
      ? { rating: { count: Number(r.ratingCount), value: Number(r.ratingAverage) } }
      : {}),
  }));

  return {
    products: productsOut,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / SHOP_PAGE_SIZE)),
    page: filters.page,
  };
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

export interface ShopFacets {
  collections: Array<{ slug: string; title: string; priority: number; count: number }>;
  optionLabels: Array<{ optionLabel: ShopOptionLabel; count: number }>;
  inStockCount: number;
}

/**
 * Live result counts for the filter rail/sheet (PROMPTS.md Phase 3 item 3: "live result counts
 * next to each option — computed from the DB, not guessed"). Each facet dimension applies every
 * OTHER currently-active filter but omits its own (via `buildShopWhereConditions`'s
 * `excludeDimension`), so selecting "In stock" narrows the collection counts shown next to each
 * collection option, but a collection's own count isn't zeroed out by the collection filter
 * itself. Three small, fixed-size queries (never one per product) run in parallel — not the single
 * round trip the product listing gets, but still O(1) in catalogue size, so it stays far from the
 * N+1 pattern the acceptance criteria are actually checking for.
 */
export async function getShopFacets(filters: ShopFilters): Promise<ShopFacets> {
  const cacheKey = JSON.stringify(filters);
  return unstable_cache(() => fetchShopFacets(filters), ["shop-facets", cacheKey], {
    tags: ["products"],
  })();
}

async function fetchShopFacets(filters: ShopFilters): Promise<ShopFacets> {
  const [collectionRows, optionRows, stockRows] = await Promise.all([
    // The collection/product join condition (not a WHERE) carries every other active filter, so a
    // collection with zero matches under those filters still appears with count 0 instead of
    // vanishing from the list (a plain WHERE on a left-joined column would turn this into an
    // inner join and drop it).
    db
      .select({
        slug: collections.slug,
        title: collections.title,
        priority: collections.priority,
        count: sql<number>`count(distinct ${products.id})`,
      })
      .from(collections)
      .leftJoin(
        products,
        and(
          eq(products.collectionId, collections.id),
          ...buildShopWhereConditions(filters, { excludeDimension: "collection" }),
        ),
      )
      .groupBy(collections.id)
      .orderBy(asc(collections.priority)),

    db
      .select({
        optionLabel: products.optionLabel,
        count: sql<number>`count(distinct ${products.id})`,
      })
      .from(products)
      .innerJoin(collections, eq(products.collectionId, collections.id))
      .where(and(...buildShopWhereConditions(filters, { excludeDimension: "optionLabel" })))
      .groupBy(products.optionLabel),

    db
      .select({ count: sql<number>`count(distinct ${products.id})` })
      .from(products)
      .innerJoin(collections, eq(products.collectionId, collections.id))
      .where(
        and(
          ...buildShopWhereConditions(filters, { excludeDimension: "inStockOnly" }),
          exists(
            sql`(select 1 from ${variants} where ${variants.productId} = ${products.id} and ${variants.inStock} = true)`,
          ),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0),
  ]);

  const optionByLabel = new Map(optionRows.map((r) => [r.optionLabel, Number(r.count)]));

  return {
    collections: collectionRows.map((r) => ({ ...r, count: Number(r.count) })),
    optionLabels: SHOP_OPTION_LABELS.map((label) => ({
      optionLabel: label,
      count: optionByLabel.get(label) ?? 0,
    })),
    inStockCount: Number(stockRows),
  };
}
