"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TypedConfirmDialog, type DangerResult } from "./DangerZone";

/**
 * The Edit / Delete controls at the end of an admin table row, so every list shows its CRUD
 * operations where staff look for them instead of hiding them on the detail page. Delete goes
 * through the same typed confirmation as the detail page's danger zone; `onDelete` is a server action
 * already bound to the row's id. Marked `data-row-actions` so clicking here never also opens the row.
 */
export function RowActions({
  editHref,
  editLabel = "Edit",
  deleteLabel = "Delete",
  confirmText,
  deleteDescription,
  onDelete,
}: {
  editHref: string;
  editLabel?: string;
  deleteLabel?: string;
  /** What staff must type to confirm the delete (a code, a slug, a name). */
  confirmText?: string;
  deleteDescription?: string;
  /** Omit to show Edit only (e.g. orders, which are never deletable). */
  onDelete?: (typed: string) => Promise<DangerResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div data-row-actions className="flex items-center justify-end gap-3 whitespace-nowrap">
      <Link href={editHref} className="text-sm font-medium text-brew-1 underline-offset-4 hover:underline">
        {editLabel}
      </Link>
      {onDelete && confirmText && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-crit underline-offset-4 hover:underline"
          >
            {deleteLabel}
          </button>
          <TypedConfirmDialog
            open={open}
            onOpenChange={setOpen}
            actionLabel={deleteLabel}
            description={deleteDescription ?? "This can't be undone."}
            confirmText={confirmText}
            onConfirm={onDelete}
            onDone={() => router.refresh()}
          />
        </>
      )}
    </div>
  );
}
