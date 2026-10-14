"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TypedConfirmDialog } from "@/components/admin/DangerZone";
import type { InboxKind } from "@/lib/db/mutations/admin-inbox";
import { deleteInboxItemAction, setInboxStatusAction } from "./actions";

/** Mark handled / new (messages and enquiries) and Delete, at the end of an inbox row. */
export function InboxItemActions({ kind, id, status }: { kind: InboxKind; id: number; status?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const canToggle = (kind === "message" || kind === "enquiry") && status != null;

  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
      {canToggle && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setInboxStatusAction({ kind: kind as "message" | "enquiry", id, status: status === "new" ? "handled" : "new" });
              router.refresh();
            })
          }
          className="text-sm font-medium text-brew-1 underline-offset-4 hover:underline"
        >
          {status === "new" ? "Mark handled" : "Mark new"}
        </button>
      )}
      <button type="button" onClick={() => setDeleting(true)} className="text-sm font-medium text-crit underline-offset-4 hover:underline">
        Delete
      </button>
      <TypedConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        actionLabel="Delete"
        description="This is removed for good."
        confirmText="delete"
        onConfirm={(typed) => deleteInboxItemAction(kind, id, typed)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
