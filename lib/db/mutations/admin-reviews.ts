import "server-only";

/**
 * Review admin writes (PROMPTS.md Phase 8 item 4; client request 2026-10-13: full CRUD, choose what
 * is published). Status moves freely between pending, approved (published) and rejected (hidden).
 *
 * Editing is limited by where a review came from (`reviews.source`): staff-entered and imported reviews
 * can be edited in full, but a shopper's own review (`customer`) can only be published, hidden or
 * deleted — never reworded or re-rated, which would put words in a real customer's mouth. That rule
 * lives here, in the only function that writes review text, not just in the UI.
 *
 * A reject reason is recorded in the audit log (there is no reject_reason column).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../index";
import { products, reviewPhotos, reviews } from "../schema";
import { deleteObject } from "@/lib/storage/storage";
import { REVIEW_PHOTO_KEY } from "@/lib/reviews/photo-key";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewTarget {
  productId: number;
  productSlug: string;
}

async function productSlugFor(productId: number): Promise<string> {
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId)).limit(1);
  return product?.slug ?? "";
}

export async function setReviewStatusDb(
  id: number,
  status: ReviewStatus,
  moderatorUserId: number,
): Promise<(ReviewTarget & { from: ReviewStatus }) | null> {
  const [before] = await db.select({ status: reviews.status }).from(reviews).where(eq(reviews.id, id)).limit(1);
  if (!before) return null;
  const [row] = await db
    .update(reviews)
    .set({ status, moderatedAt: new Date(), moderatedBy: moderatorUserId })
    .where(eq(reviews.id, id))
    .returning({ productId: reviews.productId });
  return { productId: row.productId, productSlug: await productSlugFor(row.productId), from: before.status };
}

/** Approves every given pending review; returns the affected products so each one's cached review
 * data can be refreshed. */
export async function bulkApproveReviewsDb(ids: number[], moderatorUserId: number): Promise<ReviewTarget[]> {
  if (ids.length === 0) return [];
  const affected = await db
    .update(reviews)
    .set({ status: "approved", moderatedAt: new Date(), moderatedBy: moderatorUserId })
    .where(and(inArray(reviews.id, ids), eq(reviews.status, "pending")))
    .returning({ productId: reviews.productId });
  const productIds = [...new Set(affected.map((r) => r.productId))];
  if (productIds.length === 0) return [];
  const rows = await db.select({ id: products.id, slug: products.slug }).from(products).where(inArray(products.id, productIds));
  return rows.map((p) => ({ productId: p.id, productSlug: p.slug }));
}

export interface StaffReviewInput {
  productId: number;
  authorName: string;
  email: string | null;
  rating: number;
  title: string | null;
  body: string;
  /** When the review was actually given (e.g. a WhatsApp message last week); defaults to now. */
  reviewedAt: Date | null;
  verifiedBuyer: boolean;
  status: ReviewStatus;
}

export async function createStaffReviewDb(input: StaffReviewInput, staffUserId: number): Promise<ReviewTarget & { id: number }> {
  const [row] = await db
    .insert(reviews)
    .values({
      productId: input.productId,
      authorName: input.authorName,
      email: input.email ?? "",
      rating: input.rating,
      title: input.title,
      body: input.body,
      verifiedBuyer: input.verifiedBuyer,
      status: input.status,
      source: "staff",
      createdAt: input.reviewedAt ?? new Date(),
      moderatedAt: new Date(),
      moderatedBy: staffUserId,
    })
    .returning({ id: reviews.id, productId: reviews.productId });
  return { id: row.id, productId: row.productId, productSlug: await productSlugFor(row.productId) };
}

export type UpdateReviewResult = { ok: true; before: ReviewTarget; after: ReviewTarget } | { ok: false; error: string };

export async function updateReviewDb(id: number, input: Omit<StaffReviewInput, "status">): Promise<UpdateReviewResult> {
  const [existing] = await db
    .select({ source: reviews.source, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "Review not found." };
  if (existing.source === "customer") {
    return { ok: false, error: "A customer's own review can't be edited — publish, hide or delete it instead." };
  }
  await db
    .update(reviews)
    .set({
      productId: input.productId,
      authorName: input.authorName,
      email: input.email ?? "",
      rating: input.rating,
      title: input.title,
      body: input.body,
      verifiedBuyer: input.verifiedBuyer,
      ...(input.reviewedAt ? { createdAt: input.reviewedAt } : {}),
    })
    .where(eq(reviews.id, id));
  return {
    ok: true,
    before: { productId: existing.productId, productSlug: await productSlugFor(existing.productId) },
    after: { productId: input.productId, productSlug: await productSlugFor(input.productId) },
  };
}

/** Deletes review photo files whose rows are already gone. Review photos are single files (no
 * size derivatives); only keys in the review-photo shape are touched, and a key another review
 * still uses is kept. */
async function deletePhotoFiles(storageKeys: string[]): Promise<void> {
  for (const key of storageKeys) {
    if (!REVIEW_PHOTO_KEY.test(key)) continue;
    const [stillUsed] = await db.select({ id: reviewPhotos.id }).from(reviewPhotos).where(eq(reviewPhotos.storageKey, key)).limit(1);
    if (stillUsed) continue;
    await deleteObject(key).catch(() => {});
  }
}

/** Deletes a review and its photos (rows and files). */
export async function deleteReviewDb(id: number): Promise<(ReviewTarget & { authorName: string; rating: number }) | null> {
  const [review] = await db
    .select({ productId: reviews.productId, authorName: reviews.authorName, rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!review) return null;
  const photos = await db.select({ storageKey: reviewPhotos.storageKey }).from(reviewPhotos).where(eq(reviewPhotos.reviewId, id));
  await db.delete(reviews).where(eq(reviews.id, id)); // review_photos rows cascade
  await deletePhotoFiles(photos.map((p) => p.storageKey));
  return { ...review, productSlug: await productSlugFor(review.productId) };
}

/** Removes one photo from a review (moderation: an unsuitable picture on an otherwise fine review). */
export async function deleteReviewPhotoDb(reviewId: number, photoId: number): Promise<ReviewTarget | null> {
  const [photo] = await db
    .select({ storageKey: reviewPhotos.storageKey, productId: reviews.productId })
    .from(reviewPhotos)
    .innerJoin(reviews, eq(reviews.id, reviewPhotos.reviewId))
    .where(and(eq(reviewPhotos.id, photoId), eq(reviewPhotos.reviewId, reviewId)))
    .limit(1);
  if (!photo) return null;
  await db.delete(reviewPhotos).where(eq(reviewPhotos.id, photoId));
  await deletePhotoFiles([photo.storageKey]);
  return { productId: photo.productId, productSlug: await productSlugFor(photo.productId) };
}

export interface ImportReviewRow {
  productId: number;
  authorName: string;
  email: string | null;
  rating: number;
  title: string | null;
  body: string;
  reviewedAt: Date | null;
}

/** Inserts CSV-imported reviews in one transaction; returns the affected products. */
export async function importReviewsDb(rows: ImportReviewRow[], status: ReviewStatus, staffUserId: number): Promise<ReviewTarget[]> {
  if (rows.length === 0) return [];
  const now = new Date();
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(reviews).values(
        rows.slice(i, i + 200).map((r) => ({
          productId: r.productId,
          authorName: r.authorName,
          email: r.email ?? "",
          rating: r.rating,
          title: r.title,
          body: r.body,
          verifiedBuyer: false,
          status,
          source: "import" as const,
          createdAt: r.reviewedAt ?? now,
          moderatedAt: now,
          moderatedBy: staffUserId,
        })),
      );
    }
  });
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const affected = await db.select({ id: products.id, slug: products.slug }).from(products).where(inArray(products.id, productIds));
  return affected.map((p) => ({ productId: p.id, productSlug: p.slug }));
}
