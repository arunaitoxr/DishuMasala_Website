import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getAdminReviewById, listProductsForReviewFilter } from "@/lib/db/queries/admin-reviews";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/dates";
import { ReviewForm } from "../ReviewForm";
import { ReviewStatusControls } from "../ReviewStatusControls";
import { ReviewPhotos } from "../ReviewPhotos";
import { DeleteReview } from "../DeleteReview";

export const metadata = { title: "Review" };

const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "crit" } as const;
const STATUS_LABEL = { pending: "pending", approved: "published", rejected: "hidden" } as const;
const SOURCE_LABEL = { customer: "Written by the customer on the site", staff: "Entered by staff", import: "Imported from a CSV" } as const;

export default async function AdminReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/reviews");

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId)) notFound();

  const [review, products] = await Promise.all([getAdminReviewById(reviewId), listProductsForReviewFilter()]);
  if (!review) notFound();
  const editable = review.source !== "customer";

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/reviews" className="text-sm text-ink-2 underline underline-offset-4">← Back to reviews</Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} {review.authorName}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            On{" "}
            <Link href={`/product/${review.productSlug}`} className="underline underline-offset-4">
              {review.productName}
            </Link>{" "}
            · {SOURCE_LABEL[review.source]}
          </p>
        </div>
        <Badge tone={STATUS_TONE[review.status]}>{STATUS_LABEL[review.status]}</Badge>
      </div>

      <ReviewStatusControls id={review.id} status={review.status} />

      {editable ? (
        <ReviewForm mode="edit" review={review} products={products} />
      ) : (
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink">{review.authorName}</p>
            {review.verifiedBuyer && <Badge tone="ok">Verified buyer</Badge>}
          </div>
          <p className="text-xs text-ink-3">{review.email} · {formatDateTime(review.createdAt)}</p>
          {review.title && <p className="mt-3 font-semibold text-ink">{review.title}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{review.body}</p>
          <p className="mt-4 text-xs text-ink-3">
            A customer&apos;s own review can be published, hidden or deleted, but not edited — changing their words or rating would misrepresent them.
          </p>
        </div>
      )}

      {review.photos.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Photos</h2>
          <ReviewPhotos reviewId={review.id} photos={review.photos} />
        </section>
      )}

      <DeleteReview id={review.id} />
    </div>
  );
}
