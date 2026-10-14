import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { listProductsForReviewFilter } from "@/lib/db/queries/admin-reviews";
import { ReviewForm } from "../ReviewForm";

export const metadata = { title: "Add review" };

export default async function NewReviewPage() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/reviews/new");
  const products = await listProductsForReviewFilter();
  return (
    <div className="space-y-6">
      <Link href="/admin/reviews" className="text-sm text-ink-2 underline underline-offset-4">← Back to reviews</Link>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Add a review</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          For a real review a customer gave you another way — WhatsApp, a call, email, a marketplace. It&apos;s marked as entered by staff.
        </p>
      </div>
      <ReviewForm mode="create" products={products} />
    </div>
  );
}
