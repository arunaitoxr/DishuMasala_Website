import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { ImportReviews } from "./ImportReviews";

export const metadata = { title: "Import reviews" };

export default async function ImportReviewsPage() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/reviews/import");
  return (
    <div className="space-y-6">
      <Link href="/admin/reviews" className="text-sm text-ink-2 underline underline-offset-4">← Back to reviews</Link>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Import reviews from a CSV</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">For real reviews collected elsewhere. You&apos;ll see a preview before anything is added.</p>
      </div>
      <ImportReviews />
    </div>
  );
}
