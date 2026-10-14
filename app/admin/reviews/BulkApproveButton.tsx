"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { bulkApproveReviewsAction } from "./actions";

/** Publishes every pending review in the current filter (product, rating, source, search) — after a confirmation that
 * says exactly how many (with no filter it used to publish every pending review site-wide on one click). */
export function BulkApproveButton({
  productId,
  rating,
  source,
  search,
  pendingCount,
}: {
  productId?: number;
  rating?: number;
  source?: "customer" | "staff" | "import";
  search?: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (pendingCount === 0) return null;

  function run() {
    startTransition(async () => {
      const result = await bulkApproveReviewsAction({ productId, rating, source, search });
      setMessage(result.ok ? result.message : result.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Publish {pendingCount} pending
      </Button>
      {message && (
        <span role="status" className="text-sm text-ink-2">
          {message}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="font-display text-xl font-semibold text-ink">Publish {pendingCount} reviews?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-ink-2">
            Every pending review {productId || rating ? "matching the current filter" : "on the site"} goes live on its product page.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="solid-ink" size="sm" disabled={pending} onClick={run}>
              {pending ? "Publishing…" : `Publish ${pendingCount}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
