import "server-only";

/**
 * Admin catalogue reads (PROMPTS.md Phase 8 item 1) — no `unstable_cache` here, unlike the
 * storefront product queries: the admin always needs the freshest row (it's the thing being
 * edited), and every admin page/action re-checks staff auth independently anyway.
 */
import { and, asc, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { db } from "../index";
import type { ContentStatus } from "../schema/enums";
import { collections, orderItems, productImages, products, variants } from "../schema";
import { publicUrl } from "@/lib/storage/storage";

export interface AdminProductListRow {
  id: number;
  slug: string;
  name: string;
  collectionTitle: string;
  status: ContentStatus;
  priority: number;
  variantCount: number;
  minPricePaise: number | null;
  maxPricePaise: number | null;
  imageCount: number;
}

export interface AdminProductListParams {
  page: number;
  pageSize: number;
  sort: "name" | "priority" | "status" | "collection";
  dir: "asc" | "desc";
  search?: string;
  status?: ContentStatus;
  collectionId?: number;
}

const SORTABLE: Record<AdminProductListParams["sort"], typeof products.name | typeof products.priority | typeof products.status | typeof collections.title> = {
  name: products.name,
  priority: products.priority,
  status: products.status,
  collection: collections.title,
};

export async function listAdminProducts(
  params: AdminProductListParams,
): Promise<{ rows: AdminProductListRow[]; total: number }> {
  const conditions = [];
  if (params.search?.trim()) conditions.push(ilike(products.name, `%${params.search.trim()}%`));
  // Archived = deleted: only listed when asked for, never mixed into the working list.
  conditions.push(params.status ? eq(products.status, params.status) : ne(products.status, "archived"));
  if (params.collectionId) conditions.push(eq(products.collectionId, params.collectionId));
  const where = conditions.length ? and(...conditions) : undefined;

  const orderCol = SORTABLE[params.sort];
  const orderBy = params.dir === "desc" ? desc(orderCol) : asc(orderCol);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        collectionTitle: collections.title,
        status: products.status,
        priority: products.priority,
        variantCount: sql<number>`(select count(*) from ${variants} where ${variants.productId} = ${products.id})`,
        minPricePaise: sql<number | null>`(select min(${variants.pricePaise}) from ${variants} where ${variants.productId} = ${products.id})`,
        maxPricePaise: sql<number | null>`(select max(${variants.pricePaise}) from ${variants} where ${variants.productId} = ${products.id})`,
        imageCount: sql<number>`(select count(*) from ${productImages} where ${productImages.productId} = ${products.id})`,
      })
      .from(products)
      .innerJoin(collections, eq(products.collectionId, collections.id))
      .where(where)
      .orderBy(orderBy, asc(products.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .innerJoin(collections, eq(products.collectionId, collections.id))
      .where(where),
  ]);

  return { rows: rows.map((r) => ({ ...r, variantCount: Number(r.variantCount), imageCount: Number(r.imageCount) })), total: Number(count) };
}

export interface AdminVariantRow {
  id: number;
  sku: string;
  optionValue: string;
  mrpPaise: number;
  pricePaise: number;
  weightGrams: number | null;
  inStock: boolean;
  stockQty: number | null;
  position: number;
}

export interface AdminImageRow {
  id: number;
  storageKey: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  position: number;
  isPrimary: boolean;
}

export interface AdminProductDetail {
  id: number;
  slug: string;
  name: string;
  collectionId: number;
  shortDescription: string | null;
  description: string | null;
  ingredients: string | null;
  brewGuide: string | null;
  tags: string[];
  optionLabel: string;
  priority: number;
  status: ContentStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  variants: AdminVariantRow[];
  images: AdminImageRow[];
}

export async function getAdminProductById(id: number): Promise<AdminProductDetail | null> {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;

  const [variantRows, imageRows] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, id)).orderBy(asc(variants.position)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.position)),
  ]);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    collectionId: product.collectionId,
    shortDescription: product.shortDescription,
    description: product.description,
    ingredients: product.ingredients,
    brewGuide: product.brewGuide,
    tags: product.tags,
    optionLabel: product.optionLabel,
    priority: product.priority,
    status: product.status,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    variants: variantRows,
    images: imageRows.map((img) => ({ ...img, url: publicUrl(img.storageKey) })),
  };
}

/** Real collision check against every OTHER product's slug (excludes the row being edited). */
export async function isSlugTaken(slug: string, excludeId?: number): Promise<boolean> {
  const conditions = [eq(products.slug, slug)];
  if (excludeId != null) conditions.push(ne(products.id, excludeId));
  const [row] = await db.select({ id: products.id }).from(products).where(and(...conditions)).limit(1);
  return !!row;
}

export async function getProductSlugAndStatus(id: number): Promise<{ slug: string; status: ContentStatus } | null> {
  const [row] = await db.select({ slug: products.slug, status: products.status }).from(products).where(eq(products.id, id)).limit(1);
  return row ?? null;
}

/** Checks whether a storage key is referenced by any product image OTHER than the one being deleted —
 * PROMPTS.md Phase 8 item 1's "delete with a real check that nothing else still references that
 * storage key before removing it". Each image row has its own unique derivative key
 * (products/<slug>/<hash>-w<width>.<ext>), so in practice this only guards against a duplicate
 * upload of the exact same bytes to the same key, but the check is real, not decorative. */
export async function countProductImageReferencesToKey(storageKey: string, excludeImageId?: number): Promise<number> {
  const conditions = [eq(productImages.storageKey, storageKey)];
  if (excludeImageId != null) conditions.push(ne(productImages.id, excludeImageId));
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(productImages).where(and(...conditions));
  return Number(row?.count ?? 0);
}

export async function listCollectionsForPicker(): Promise<{ id: number; title: string }[]> {
  return db.select({ id: collections.id, title: collections.title }).from(collections).orderBy(asc(collections.priority));
}

/** SKUs from `skus` already used by a variant of some OTHER product (SKUs are unique store-wide). */
export async function findSkusUsedElsewhere(skus: string[], excludeProductId?: number): Promise<string[]> {
  if (skus.length === 0) return [];
  const conditions = [inArray(variants.sku, skus)];
  if (excludeProductId != null) conditions.push(ne(variants.productId, excludeProductId));
  const rows = await db.select({ sku: variants.sku }).from(variants).where(and(...conditions));
  return rows.map((r) => r.sku);
}

/** How many past order lines point at this product's variants — shown before a permanent delete. */
export async function countOrderLinesForProduct(productId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orderItems)
    .innerJoin(variants, eq(variants.id, orderItems.variantId))
    .where(eq(variants.productId, productId));
  return Number(row?.n ?? 0);
}
