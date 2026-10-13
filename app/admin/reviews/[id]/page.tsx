import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getAdminReviewById } from "@/lib/db/queries/admin-reviews";
import { Badge } from "@/components/ui/Badge";
import { ReviewModerationActions } from "./ReviewModerationActions";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Review" };

export default async function AdminReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/reviews");

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId)) notFound();

  const review = await getAdminReviewById(reviewId);
  if (!review) notFound();

  const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "crit" } as const;

  return (
    <div className="max-w-2xl">
      <Link href="/admin/reviews" className="text-sm text-ink-2 underline underline-offset-4">← Back to reviews</Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            On{" "}
            <Link href={`/product/${review.productSlug}`} className="underline underline-offset-4">
              {review.productName}
            </Link>
          </p>
        </div>
        <Badge tone={STATUS_TONE[review.status]}>{review.status}</Badge>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink">{review.authorName}</p>
          {review.verifiedBuyer && <Badge tone="ok">Verified buyer</Badge>}
        </div>
        <p className="text-xs text-ink-3">{review.email} · {formatDateTime(review.createdAt)}</p>
        {review.title && <p className="mt-3 font-semibold text-ink">{review.title}</p>}
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{review.body}</p>

        {review.photos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {review.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="relative block size-24 overflow-hidden rounded-md border border-line">
                <Image src={p.url} alt="Review photo" fill sizes="96px" className="object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {review.status === "pending" && (
        <div className="mt-6">
          <ReviewModerationActions reviewId={review.id} />
        </div>
      )}
    </div>
  );
}
