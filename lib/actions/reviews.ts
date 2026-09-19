"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { submitReview } from "@/lib/db/mutations/reviews";
import { getProductBySlug } from "@/lib/db/queries/product-detail";
import { getApprovedReviews, getHomepageReviewsPage, type ReviewSort } from "@/lib/db/queries/reviews";
import { publicUrl } from "@/lib/storage/storage";

const reviewSchema = z.object({
  productSlug: z.string().min(1),
  authorName: z.string().trim().min(2, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  rating: z.number().int().min(1, "Choose a rating").max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10, "Say a bit more — at least 10 characters").max(4000),
  // Photo keys are produced only by app/api/reviews/upload/route.ts, which already validated
  // type/size/EXIF server-side — this action re-checks the count, never trusts anything else.
  photoR2Keys: z.array(z.string().min(1)).max(3, "Up to 3 photos"),
});

export type ReviewFormInput = z.infer<typeof reviewSchema>;

export type SubmitReviewFormResult =
  | { ok: true; reviewId: number }
  | { ok: false; error: string };

/** Hashes the caller's IP for the rate limit (lib/db/mutations/reviews.ts) — never stores the raw
 * address. `x-forwarded-for` is what Vercel/most proxies set; falls back to nothing rather than
 * guessing when it's absent (e.g. local dev without a proxy in front). */
async function hashRequestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

/** Server action behind `components/pdp/ReviewForm.tsx`. Every submission lands as
 * `status: "pending"` (lib/db/mutations/reviews.ts) — never visible on the storefront until a
 * future moderation pass approves it. */
export async function submitReviewAction(input: ReviewFormInput): Promise<SubmitReviewFormResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review" };
  }

  const product = await getProductBySlug(parsed.data.productSlug);
  if (!product) {
    return { ok: false, error: "This product could not be found." };
  }

  const ipHash = await hashRequestIp();

  const result = await submitReview({
    productId: product.id,
    authorName: parsed.data.authorName,
    email: parsed.data.email,
    rating: parsed.data.rating,
    title: parsed.data.title || null,
    body: parsed.data.body,
    photoR2Keys: parsed.data.photoR2Keys,
    ipHash,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }
  return { ok: true, reviewId: result.reviewId };
}

/** Supabase Storage may not be configured in every environment (this dev one included — no bucket credentials
 * exist yet, CLAUDE.md-honest about it rather than crashing the reviews list over it). A photo
 * URL that can't be resolved is simply omitted, never a thrown error mid-render. */
function safePublicUrl(storageKey: string): string | null {
  try {
    return publicUrl(storageKey);
  } catch {
    return null;
  }
}

export interface ReviewPagePhoto {
  id: number;
  url: string;
}

export interface ReviewPageItem {
  id: number;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedBuyer: boolean;
  createdAt: string;
  photos: ReviewPagePhoto[];
}

export interface ReviewsPageResult {
  items: ReviewPageItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HomepageReviewsPageResult {
  items: Array<Omit<ReviewPageItem, "photos"> & { productName: string; productSlug: string }>;
  total: number;
  page: number;
  pageSize: number;
}

/** Server action behind Reviews.tsx's sort/pagination controls — approved-only, same query as the
 * page's initial server render (lib/db/queries/reviews.ts), so a client-driven page change never
 * has a way to surface a pending review. */
export async function getReviewsPageAction(
  productSlug: string,
  sort: ReviewSort,
  page: number,
): Promise<ReviewsPageResult> {
  const product = await getProductBySlug(productSlug);
  if (!product) return { items: [], total: 0, page: 1, pageSize: 10 };

  const result = await getApprovedReviews(product.id, { sort, page });
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      // Same `unstable_cache` JSON-round-trip caveat as app/product/[slug]/page.tsx: `createdAt`
      // may already be a string by the time it gets here.
      createdAt: new Date(item.createdAt).toISOString(),
      photos: item.photos
        .map((p) => ({ id: p.id, url: safePublicUrl(p.storageKey) }))
        .filter((p): p is ReviewPagePhoto => p.url != null),
    })),
  };
}

/** Approved homepage reviews, in five-card pages. This mirrors the initial server render so
 * opening View more cannot surface pending reviews. */
export async function getHomepageReviewsPageAction(page: number): Promise<HomepageReviewsPageResult> {
  const result = await getHomepageReviewsPage(page);
  return {
    ...result,
    items: result.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt).toISOString() })),
  };
}
