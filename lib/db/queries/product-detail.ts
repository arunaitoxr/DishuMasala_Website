import "server-only";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../index";
import { notGiftOnly } from "./gift-only";
import { collections, productImages, products, variants } from "../schema";
import { paise } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";
import type { ProductWithVariants } from "@/types/catalog";
import type { ProductCardData, ProductThumbnail } from "@/types/catalog";

/** Every published product's slug — `app/product/[slug]/page.tsx`'s `generateStaticParams`
 * (Phase 4), same "published" filter Phase 3 established for the shop/collections listings. */
export async function getAllPublishedProductSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.status, "published"));
  return rows.map((r) => r.slug);
}

/**
 * A single published product with its variants (ordered by position) and images (ordered by
 * position, primary first) — everything `app/product/[slug]/page.tsx` and its PDP components
 * need in one round trip. Returns null for an unknown or unpublished slug (a 404, not a crash).
 *
 * Cached per slug on the `product:<slug>` tag (CLAUDE.md §3.4).
 */
export async function getProductBySlug(slug: string): Promise<ProductWithVariants | null> {
  return unstable_cache(() => fetchProductBySlug(slug), ["product-by-slug", slug], {
    tags: ["products", `product:${slug}`],
  })();
}

async function fetchProductBySlug(slug: string): Promise<ProductWithVariants | null> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "published")))
    .limit(1);

  if (!product) return null;

  const [variantRows, imageRows] = await Promise.all([
    db
      .select()
      .from(variants)
      .where(and(eq(variants.productId, product.id), notGiftOnly))
      .orderBy(asc(variants.position)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.position)),
  ]);

  return {
    ...product,
    variants: variantRows.map((v) => ({
      ...v,
      mrpPaise: paise(v.mrpPaise),
      pricePaise: paise(v.pricePaise),
      imageUrl: v.imageStorageKey ? safeImageUrl(v.imageStorageKey) : null,
    })),
    images: imageRows,
  };
}

function safeImageUrl(storageKey: string): string | null {
  try {
    return publicUrl(storageKey);
  } catch {
    return null;
  }
}

/**
 * Related products by priority rank (CLAUDE.md §7.2 / PROMPTS.md Phase 4 item 9), excluding the
 * current product — published only, capped at `limit`. Reuses the same priority-then-price-desc
 * ordering `lib/commerce/priority-sort.ts` defines, applied here in SQL (`ORDER BY`) rather than
 * in memory since it's already a single, small query.
 */
export async function getRelatedProducts(excludeProductId: number, limit = 4): Promise<ProductCardData[]> {
  return unstable_cache(
    () => fetchRelatedProducts(excludeProductId, limit),
    ["related-products", String(excludeProductId), String(limit)],
    { tags: ["products"] },
  )();
}

async function fetchRelatedProducts(excludeProductId: number, limit: number): Promise<ProductCardData[]> {
  // Pick the top-`limit` product ids by priority first (a small, cheap query), then fetch those
  // products' full variant lists in one second query — two round trips total, never N+1 per
  // product, and still a stable priority-then-id order (CLAUDE.md §7.2 / lib/commerce/priority-sort.ts).
  const topIds = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.status, "published"), ne(products.id, excludeProductId)))
    .orderBy(asc(products.priority), asc(products.id))
    .limit(limit);

  if (topIds.length === 0) return [];
  const ids = new Set(topIds.map((r) => r.id));

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
    .where(and(eq(products.status, "published"), ne(products.id, excludeProductId)))
    .orderBy(asc(products.priority), asc(products.id), asc(variants.position));

  const byId = new Map<number, ProductCardData>();
  for (const r of rows) {
    if (!ids.has(r.id)) continue;
    let product = byId.get(r.id);
    if (!product) {
      // Destructured out (never referenced) — `r.variant` belongs on the per-row array pushed
      // below, not on the product object itself.
      const { variant, ...rest } = r;
      void variant;
      product = { ...rest, variants: [], images: [] };
      byId.set(r.id, product);
    }
    if (r.variant && r.variant.id != null) {
      // Related-product cards never render the per-variant pack image (PDP BuyBox only) — null,
      // not a second query this list never needs.
      product.variants.push({ ...r.variant, mrpPaise: paise(r.variant.mrpPaise), pricePaise: paise(r.variant.pricePaise), imageUrl: null });
    }
  }

  const productsOut = topIds.map((r) => byId.get(r.id)).filter((p): p is ProductCardData => p != null);

  // A second, small query rather than a join — see products.ts's attachImages for why joining
  // product_images alongside the variants left-join above would corrupt both aggregated lists.
  if (productsOut.length > 0) {
    const imageRows = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productsOut.map((p) => p.id)))
      .orderBy(desc(productImages.isPrimary), asc(productImages.position));

    const imagesByProductId = new Map<number, ProductThumbnail[]>();
    for (const img of imageRows) {
      const list = imagesByProductId.get(img.productId) ?? [];
      list.push({ url: publicUrl(img.storageKey), alt: img.alt, width: img.width, height: img.height });
      imagesByProductId.set(img.productId, list);
    }
    for (const product of productsOut) {
      product.images = imagesByProductId.get(product.id) ?? [];
    }
  }

  return productsOut;
}
