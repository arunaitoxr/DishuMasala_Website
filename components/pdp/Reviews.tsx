"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Rating } from "@/components/ui/Rating";
import { Pagination } from "@/components/ui/Pagination";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { Badge } from "@/components/ui/Badge";
import { ReviewForm } from "@/components/pdp/ReviewForm";
import { cn } from "@/lib/cn";
import type { ReviewSort } from "@/lib/db/queries/reviews";
import { getReviewsPageAction, type ReviewPageItem, type ReviewsPageResult } from "@/lib/actions/reviews";

export interface ReviewSummaryProps {
  count: number;
  average: number;
  histogram: [number, number, number, number, number];
}

export interface ReviewsProps {
  productSlug: string;
  productName: string;
  summary: ReviewSummaryProps;
  initialPage: ReviewsPageResult;
}

function Histogram({ histogram, count }: { histogram: [number, number, number, number, number]; count: number }) {
  return (
    <div className="flex flex-col gap-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = histogram[star - 1];
        const pct = count > 0 ? Math.round((n / count) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs text-ink-2">
            <span className="w-10 tabular-nums">{star} star</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-citrus" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 tabular-nums text-right">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({ review, onOpenPhoto }: { review: ReviewPageItem; onOpenPhoto: (url: string, alt: string) => void }) {
  return (
    <article className="border-b border-line py-5 last:border-b-0">
      <div className="flex items-center gap-2">
        <Rating value={review.rating} />
        {review.verifiedBuyer && <Badge tone="ok">Verified buyer</Badge>}
      </div>
      {review.title && <h3 className="mt-2 font-semibold text-ink">{review.title}</h3>}
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{review.body}</p>

      {review.photos.length > 0 && (
        <div className="mt-3 flex gap-2">
          {review.photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onOpenPhoto(photo.url, `Photo from ${review.authorName}'s review`)}
              className="size-16 overflow-hidden rounded-md border border-line"
            >
              <Image src={photo.url} alt="" width={64} height={64} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-ink-3">
        {review.authorName} ·{" "}
        {new Date(review.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
      </p>
    </article>
  );
}

const PREVIEW_COUNT = 5;

/**
 * Rating histogram, a top-5 preview of approved reviews, a "Show all" popup carrying the full
 * sortable/paginated list, a photo lightbox, and the submission form — all in one section anchored
 * at `#reviews` so BuyBox's rating link can scroll to it (PROMPTS.md Phase 4 item 3/7). The
 * histogram and list are real approved-review data, which is zero everywhere pre-launch
 * (CLAUDE.md §8: no seeded/sample reviews, ever) — that all-zero state renders honestly rather
 * than being hidden or faked.
 *
 * Only the top 5 (most recent, since `initialPage` is always fetched with `sort: "recent"`) render
 * inline — everything else, plus sort/pagination, lives behind "View more reviews" so a product
 * with hundreds of reviews doesn't turn the PDP itself into one long scroll.
 */
export function Reviews({ productSlug, productName, summary, initialPage }: ReviewsProps) {
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [page, setPage] = useState(initialPage);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [showAllOpen, setShowAllOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const refetch = (nextSort: ReviewSort, nextPageNum: number) => {
    startTransition(async () => {
      const result = await getReviewsPageAction(productSlug, nextSort, nextPageNum);
      setPage(result);
    });
  };

  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const previewItems = initialPage.items.slice(0, PREVIEW_COUNT);

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="w-full scroll-mt-24">
      <h2 id="reviews-heading" className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        Reviews
      </h2>

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          {summary.count > 0 ? (
            <>
              <div>
                <span className="font-display text-3xl font-semibold text-ink">{summary.average.toFixed(1)}</span>
                <span className="ml-2 text-sm text-ink-2">out of 5 · {summary.count} review{summary.count === 1 ? "" : "s"}</span>
              </div>
              <Histogram histogram={summary.histogram} count={summary.count} />
            </>
          ) : (
            <p className="rounded-md border border-line bg-surface-2 px-4 py-6 text-sm text-ink-2">
              No reviews yet. Be the first to review {productName}.
            </p>
          )}
        </div>

        <div>
          {previewItems.length === 0 ? (
            <p className="text-sm text-ink-2">No approved reviews to show yet.</p>
          ) : (
            <>
              {previewItems.map((review) => (
                <ReviewCard key={review.id} review={review} onOpenPhoto={(url, alt) => setLightbox({ url, alt })} />
              ))}

              {summary.count > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllOpen(true)}
                  className="mt-4 h-10 rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-2"
                >
                  View more reviews ({summary.count})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-12 border-t border-line pt-8">
        <h3 className="font-display text-xl font-semibold text-ink">Write a review</h3>
        <ReviewForm productSlug={productSlug} />
      </div>

      <Dialog open={lightbox != null} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-xl bg-surface p-2">
          <VisuallyHidden>
            <DialogTitle>{lightbox?.alt ?? "Review photo"}</DialogTitle>
          </VisuallyHidden>
          {lightbox && (
            <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: "1 / 1" }}>
              <Image src={lightbox.url} alt={lightbox.alt} fill className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAllOpen} onOpenChange={setShowAllOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto bg-surface p-6">
          <DialogTitle className="font-display text-xl font-semibold text-ink">
            All reviews for {productName}
          </DialogTitle>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              Sort by
              <select
                value={sort}
                onChange={(e) => {
                  const next = e.target.value as ReviewSort;
                  setSort(next);
                  refetch(next, 1);
                }}
                className="h-9 rounded-sm border border-line bg-surface px-2 text-sm text-ink"
              >
                <option value="recent">Most recent</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </select>
            </label>
          </div>

          <div className={cn(pending && "opacity-60")}>
            {page.items.length === 0 ? (
              <p className="mt-6 text-sm text-ink-2">No approved reviews to show yet.</p>
            ) : (
              page.items.map((review) => (
                <ReviewCard key={review.id} review={review} onOpenPhoto={(url, alt) => setLightbox({ url, alt })} />
              ))
            )}
          </div>

          <Pagination
            page={page.page}
            totalPages={totalPages}
            onPageChange={(n) => {
              setPage((p) => ({ ...p, page: n }));
              refetch(sort, n);
            }}
            className="mt-4"
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
