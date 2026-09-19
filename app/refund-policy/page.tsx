import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPageBySlug } from "@/lib/db/queries/pages";
import { TiptapRenderer } from "@/components/content/TiptapRenderer";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Refund & Cancellation Policy", alternates: { canonical: "/refund-policy" } };

export default async function RefundPolicyPage() {
  const page = await getPublishedPageBySlug("refund-policy");
  if (!page) notFound();
  return (
    <div className={cn(PAGE_CONTAINER, "py-12 lg:py-16")}>
      <article className="max-w-3xl">
      <h1 className="type-page-title text-ink">{page.title}</h1>
      <div className="mt-8">
        <TiptapRenderer doc={page.body} />
      </div>
      </article>
    </div>
  );
}
