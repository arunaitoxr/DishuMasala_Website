"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { setReviewStatusAction } from "./actions";

type Status = "pending" | "approved" | "rejected";

/**
 * Publish / Hide / Back to pending — available whatever the review's current status, so a published
 * review can be taken down and a hidden one brought back (it used to be one-way, pending only).
 * `compact` is the list's inline toggle; the full version (review page) also takes an optional
 * internal reason when hiding, kept in the audit log.
 */
export function ReviewStatusControls({ id, status, compact = false }: { id: number; status: Status; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function set(next: Status) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await setReviewStatusAction({ id, status: next, reason: next === "rejected" ? reason : undefined });
      if (!result.ok) setError(result.error);
      else setNotice(result.message);
      router.refresh();
    });
  }

  if (compact) {
    return status === "approved" ? (
      <button type="button" disabled={pending} onClick={() => set("rejected")} className="text-sm font-medium text-ink-2 underline-offset-4 hover:underline">
        Hide
      </button>
    ) : (
      <button type="button" disabled={pending} onClick={() => set("approved")} className="text-sm font-medium text-ok underline-offset-4 hover:underline">
        Publish
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Show on the site?</h2>
      <p className="text-sm text-ink-2">
        {status === "approved"
          ? "Published — shoppers see this review on the product page."
          : status === "rejected"
            ? "Hidden — not shown anywhere on the site."
            : "Pending — waiting for a decision; not shown on the site."}
      </p>
      {status !== "rejected" && (
        <div>
          <label htmlFor="hide-reason" className="mb-1 block text-xs font-medium text-ink-2">Reason for hiding (optional, internal)</label>
          <Input id="hide-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. spam, abusive, wrong product" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status !== "approved" && (
          <Button type="button" variant="solid-ink" size="sm" disabled={pending} onClick={() => set("approved")}>
            Publish
          </Button>
        )}
        {status !== "rejected" && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => set("rejected")}>
            Hide
          </Button>
        )}
        {status !== "pending" && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => set("pending")}>
            Back to pending
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      {notice && <p role="status" className="text-sm text-ok">{notice}</p>}
    </section>
  );
}
