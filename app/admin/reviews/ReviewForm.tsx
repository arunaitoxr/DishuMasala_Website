"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { toISTDateTimeLocal } from "@/lib/dates";
import type { AdminReviewDetail } from "@/lib/db/queries/admin-reviews";
import { createReviewAction, updateReviewAction } from "./actions";

const selectClass = "h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[0.95rem] text-ink";

/**
 * Add or edit a review entered by staff — a real review that arrived by WhatsApp, phone, email or a
 * marketplace (client request, 2026-10-13). Only `staff`/`import` reviews reach the edit mode; a
 * customer's own review is never reworded (the server refuses it too).
 */
export function ReviewForm({
  mode,
  review,
  products,
}: {
  mode: "create" | "edit";
  review?: AdminReviewDetail;
  products: { id: number; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [productId, setProductId] = useState(review ? String(review.productId) : "");
  const [authorName, setAuthorName] = useState(review?.authorName ?? "");
  const [email, setEmail] = useState(review?.email ?? "");
  const [rating, setRating] = useState(review ? String(review.rating) : "5");
  const [title, setTitle] = useState(review?.title ?? "");
  const [body, setBody] = useState(review?.body ?? "");
  const [reviewedAt, setReviewedAt] = useState(review ? toISTDateTimeLocal(review.createdAt) : "");
  const [verifiedBuyer, setVerifiedBuyer] = useState(review?.verifiedBuyer ?? false);
  const [publish, setPublish] = useState(true);

  // Two products can share a name (Classic Tea 250 gm / 500 gm), so the slug disambiguates.
  const nameCounts = products.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.name]: (acc[p.name] ?? 0) + 1 }), {});

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fields = {
        productId: Number(productId),
        authorName,
        email: email.trim() || null,
        rating: Number(rating),
        title: title.trim() || null,
        body,
        reviewedAt: reviewedAt || null,
        verifiedBuyer,
      };
      const result =
        mode === "create" ? await createReviewAction({ ...fields, status: publish ? "approved" : "pending" }) : await updateReviewAction(review!.id, fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      if (mode === "create" && "data" in result && result.data) router.push(`/admin/reviews/${result.data.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {error && (
        <div role="alert" className="rounded-md border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-md border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
          {notice}
        </div>
      )}
      <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <div>
          <label htmlFor="productId" className="mb-1 block text-sm font-medium text-ink">Product</label>
          <select id="productId" value={productId} onChange={(e) => setProductId(e.target.value)} className={selectClass}>
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {nameCounts[p.name] > 1 ? `${p.name} (${p.slug})` : p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="authorName" className="mb-1 block text-sm font-medium text-ink">Reviewer name</label>
            <Input id="authorName" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">Reviewer email (optional, never shown)</label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rating" className="mb-1 block text-sm font-medium text-ink">Rating</label>
            <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)} className={selectClass}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)}{"☆".repeat(5 - n)} ({n})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="reviewedAt" className="mb-1 block text-sm font-medium text-ink">Review date, IST (optional — defaults to now)</label>
            <Input id="reviewedAt" type="datetime-local" value={reviewedAt} onChange={(e) => setReviewedAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-ink">Title (optional)</label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="body" className="mb-1 block text-sm font-medium text-ink">Review text</label>
          <Textarea id="body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-xs text-ink-3">Enter the customer&apos;s own words exactly as they gave them.</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink">
          <Checkbox checked={verifiedBuyer} onCheckedChange={(c) => setVerifiedBuyer(c === true)} className="mt-0.5" />
          <span>
            Verified buyer
            <span className="block text-xs text-ink-3">Only tick this if you&apos;ve confirmed this person bought the product.</span>
          </span>
        </label>
        {mode === "create" && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox checked={publish} onCheckedChange={(c) => setPublish(c === true)} />
            Publish on the site straight away
          </label>
        )}
      </section>
      <Button type="button" variant="solid-ink" disabled={pending} onClick={save}>
        {mode === "create" ? "Add review" : "Save changes"}
      </Button>
    </div>
  );
}
