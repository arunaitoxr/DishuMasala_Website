import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../index";
import { orderItems, orders, products, reviewPhotos, reviews, variants } from "../schema";

export type ReviewSort = "recent" | "highest" | "lowest";

export interface ReviewListItem {
  id: number;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedBuyer: boolean;
  createdAt: Date;
  photos: { id: number; storageKey: string; position: number }[];
}

export interface ReviewSummary {
  count: number;
  average: number;
  /** Index 0 = count of 1-star reviews ... index 4 = count of 5-star reviews. All approved. */
  histogram: [number, number, number, number, number];
}

const PAGE_SIZE = 10;

/** Approved-only rating summary for a product — an honest all-zero result when nothing has been
 * approved yet (there are zero reviews anywhere in this project pre-launch — CLAUDE.md §8). */
export async function getReviewSummary(productId: number): Promise<ReviewSummary> {
  return unstable_cache(() => fetchReviewSummary(productId), ["review-summary", String(productId)], {
    tags: [`reviews:${productId}`],
  })();
}

async function fetchReviewSummary(productId: number): Promise<ReviewSummary> {
  const rows = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)` })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
    .groupBy(reviews.rating);

  const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    const n = Number(r.n);
    if (r.rating >= 1 && r.rating <= 5) histogram[r.rating - 1] = n;
    count += n;
    sum += r.rating * n;
  }

  return { count, average: count > 0 ? sum / count : 0, histogram };
}

/** Paginated, approved-only review list for a product — never includes pending/rejected rows, so
 * a freshly submitted review can never appear here (CLAUDE.md §8 / PROMPTS.md Phase 4). */
export async function getApprovedReviews(
  productId: number,
  opts: { sort?: ReviewSort; page?: number } = {},
): Promise<{ items: ReviewListItem[]; total: number; page: number; pageSize: number }> {
  const sort = opts.sort ?? "recent";
  const page = Math.max(1, opts.page ?? 1);

  return unstable_cache(
    () => fetchApprovedReviews(productId, sort, page),
    ["approved-reviews", String(productId), sort, String(page)],
    { tags: [`reviews:${productId}`] },
  )();
}

async function fetchApprovedReviews(
  productId: number,
  sort: ReviewSort,
  page: number,
): Promise<{ items: ReviewListItem[]; total: number; page: number; pageSize: number }> {
  const where = and(eq(reviews.productId, productId), eq(reviews.status, "approved"));

  const orderBy =
    sort === "highest"
      ? [desc(reviews.rating), desc(reviews.createdAt)]
      : sort === "lowest"
        ? [asc(reviews.rating), desc(reviews.createdAt)]
        : [desc(reviews.createdAt)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        authorName: reviews.authorName,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        verifiedBuyer: reviews.verifiedBuyer,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(where)
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(reviews).where(where),
  ]);

  const ids = rows.map((r) => r.id);
  const photoRows = ids.length
    ? await db
        .select()
        .from(reviewPhotos)
        .where(inArray(reviewPhotos.reviewId, ids))
        .orderBy(asc(reviewPhotos.position))
    : [];

  const photosByReview = new Map<number, ReviewListItem["photos"]>();
  for (const p of photoRows) {
    const list = photosByReview.get(p.reviewId) ?? [];
    list.push({ id: p.id, storageKey: p.storageKey, position: p.position });
    photosByReview.set(p.reviewId, list);
  }

  return {
    items: rows.map((r) => ({ ...r, photos: photosByReview.get(r.id) ?? [] })),
    total: Number(total),
    page,
    pageSize: PAGE_SIZE,
  };
}

/**
 * Whether `email` has a delivered order containing `productId` — the real join CLAUDE.md §6's
 * `reviews.verified_buyer` describes (orders/order_items → variants → product). There are no real
 * orders yet (Phase 5 builds checkout), so this correctly evaluates false for everyone today; it
 * is wired for real rather than stubbed so it starts working the moment orders exist.
 */
export async function hasDeliveredOrderForProduct(email: string, productId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(variants, eq(variants.id, orderItems.variantId))
    .where(and(eq(orders.email, email), eq(orders.status, "delivered"), eq(variants.productId, productId)))
    .limit(1);

  return row != null;
}

/** Count of reviews from this email in the last `windowHours` — used by the submission rate limit. */
export async function countRecentReviewsByEmail(email: string, windowHours: number): Promise<number> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reviews)
    .where(and(eq(reviews.email, email), sql`${reviews.createdAt} >= ${since}`));
  return Number(row?.n ?? 0);
}

/** Count of reviews from this hashed IP in the last `windowHours` — the second half of the rate limit. */
export async function countRecentReviewsByIpHash(ipHash: string, windowHours: number): Promise<number> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reviews)
    .where(and(eq(reviews.ipHash, ipHash), sql`${reviews.createdAt} >= ${since}`));
  return Number(row?.n ?? 0);
}

/** One approved review, carrying the product it belongs to — the homepage shows reviews across the
 * whole catalogue, so unlike `ReviewListItem` each row has to name its own product. */
export interface HomepageReviewItem {
  id: number;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedBuyer: boolean;
  createdAt: Date;
  productName: string;
  productSlug: string;
}

/**
 * The homepage's social-proof rail: the most recent approved reviews across every published
 * product (client bug list row 13, 2026-09-17: "Add Reviews").
 *
 * Approved-only and published-product-only, exactly like the PDP list — a pending review can never
 * surface here, so the moderation queue stays the single gate on what the public sees.
 *
 * **This returns an empty array today and that is correct, not a bug.** There are zero approved
 * reviews in this project: the only row in the table is an `E2E Tester` fixture left by the
 * Playwright suite. CLAUDE.md §8 forbids inventing reviews, so the homepage renders its empty
 * state until real ones exist rather than seeding plausible-looking ones. The section fills itself
 * the moment the client starts approving genuine reviews — nothing else has to change.
 *
 * Cached on the shared `reviews` tag so approving a review in the admin refreshes the homepage.
 */
export interface HomepageReviewsPage {
  items: HomepageReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Homepage social proof, paged at five cards per view. The landing page renders only its first
 * five cards, with the remaining approved reviews available through View more. */
export async function getHomepageReviewsPage(page = 1): Promise<HomepageReviewsPage> {
  const safePage = Math.max(1, page);
  return unstable_cache(
    () => fetchHomepageReviewsPage(safePage),
    ["homepage-reviews", String(safePage)],
    { tags: ["reviews"] },
  )();
}

async function fetchHomepageReviewsPage(page: number): Promise<HomepageReviewsPage> {
  // Six, not five: the rail is a 3-up grid from `lg`, and five left an empty slot in its second row.
  const pageSize = 6;
  const where = and(eq(reviews.status, "approved"), eq(products.status, "published"));
  const [rows, [{ total }]] = await Promise.all([
    db
    .select({
      id: reviews.id,
      authorName: reviews.authorName,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      verifiedBuyer: reviews.verifiedBuyer,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(where)
    .orderBy(desc(reviews.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)` }).from(reviews).innerJoin(products, eq(products.id, reviews.productId)).where(where),
  ]);

  return {
    items: rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })),
    total: Number(total),
    page,
    pageSize,
  };
}
