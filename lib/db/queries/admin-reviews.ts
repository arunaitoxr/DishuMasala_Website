import "server-only";

import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../index";
import { products, reviewPhotos, reviews } from "../schema";

export interface AdminReviewRow {
  id: number;
  productId: number;
  productName: string;
  productSlug: string;
  authorName: string;
  email: string;
  rating: number;
  title: string | null;
  body: string;
  status: "pending" | "approved" | "rejected";
  verifiedBuyer: boolean;
  /** customer = submitted on the site (not editable); staff / import = entered by the team. */
  source: "customer" | "staff" | "import";
  createdAt: Date;
  photoCount: number;
}

export interface AdminReviewFilters {
  status?: "pending" | "approved" | "rejected";
  source?: "customer" | "staff" | "import";
  /** Matches the reviewer's name, the title or the review text. */
  search?: string;
  productId?: number;
  rating?: number;
  page: number;
}

const PAGE_SIZE = 20;

/** The list's filters as SQL — shared by the list and by bulk publish, so "publish what matches"
 * means exactly the rows on screen. */
function reviewFilterConditions(filters: Omit<AdminReviewFilters, "page">) {
  const conditions = [];
  if (filters.status) conditions.push(eq(reviews.status, filters.status));
  if (filters.source) conditions.push(eq(reviews.source, filters.source));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(reviews.authorName, term), ilike(reviews.title, term), ilike(reviews.body, term))!);
  }
  if (filters.productId) conditions.push(eq(reviews.productId, filters.productId));
  if (filters.rating) conditions.push(eq(reviews.rating, filters.rating));
  return conditions;
}

export async function listAdminReviews(filters: AdminReviewFilters): Promise<{ rows: AdminReviewRow[]; total: number }> {
  const conditions = reviewFilterConditions(filters);
  const where = conditions.length ? and(...conditions) : undefined;

  // Pending first (PROMPTS.md's explicit "pending reviews first"), regardless of the status
  // filter chosen, then most recent.
  const pendingFirst = sql`case when ${reviews.status} = 'pending' then 0 else 1 end`;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        productName: products.name,
        productSlug: products.slug,
        authorName: reviews.authorName,
        email: reviews.email,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        status: reviews.status,
        verifiedBuyer: reviews.verifiedBuyer,
        source: reviews.source,
        createdAt: reviews.createdAt,
        photoCount: sql<number>`(select count(*) from ${reviewPhotos} where ${reviewPhotos.reviewId} = ${reviews.id})`,
      })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .where(where)
      .orderBy(asc(pendingFirst), desc(reviews.createdAt))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)` }).from(reviews).where(where),
  ]);

  return { rows: rows.map((r) => ({ ...r, photoCount: Number(r.photoCount) })), total: Number(count) };
}

export { PAGE_SIZE as ADMIN_REVIEWS_PAGE_SIZE };

export interface AdminReviewDetail extends AdminReviewRow {
  photos: { id: number; storageKey: string; url: string }[];
}

export async function getAdminReviewById(id: number): Promise<AdminReviewDetail | null> {
  const [row] = await db
    .select({
      id: reviews.id,
      productId: reviews.productId,
      productName: products.name,
      productSlug: products.slug,
      authorName: reviews.authorName,
      email: reviews.email,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
      verifiedBuyer: reviews.verifiedBuyer,
      source: reviews.source,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.id, id))
    .limit(1);
  if (!row) return null;

  const { publicUrl } = await import("@/lib/storage/storage");
  const photoRows = await db.select().from(reviewPhotos).where(eq(reviewPhotos.reviewId, id)).orderBy(asc(reviewPhotos.position));

  return { ...row, photoCount: photoRows.length, photos: photoRows.map((p) => ({ id: p.id, storageKey: p.storageKey, url: publicUrl(p.storageKey) })) };
}

/** Ids of every pending review matching the list's current filters (source, search, product,
 * rating) — backs "bulk approve" (approve every pending review in the current filtered view). */
export async function getPendingReviewIds(filters: Omit<AdminReviewFilters, "page" | "status">): Promise<number[]> {
  const conditions = reviewFilterConditions({ ...filters, status: "pending" });
  const rows = await db.select({ id: reviews.id }).from(reviews).where(and(...conditions));
  return rows.map((r) => r.id);
}

export async function listProductsForReviewFilter(): Promise<{ id: number; name: string; slug: string }[]> {
  // Deleted (archived) products take no new reviews and aren't worth filtering by.
  return db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(products)
    .where(ne(products.status, "archived"))
    .orderBy(asc(products.name), asc(products.slug));
}

/** "product|author|body" keys of the reviews already on these products — the CSV import skips rows
 * that match one, so importing the same file twice doesn't double every review. */
export async function getReviewFingerprints(productIds: number[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await db
    .select({ productId: reviews.productId, authorName: reviews.authorName, body: reviews.body })
    .from(reviews)
    .where(inArray(reviews.productId, productIds));
  return new Set(rows.map((r) => reviewFingerprint(r.productId, r.authorName, r.body)));
}

export function reviewFingerprint(productId: number, authorName: string, body: string): string {
  return `${productId}|${authorName.trim().toLowerCase()}|${body.trim().replace(/\s+/g, " ")}`;
}
