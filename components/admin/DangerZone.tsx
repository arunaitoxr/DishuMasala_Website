"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

export type DangerResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The typed-confirmation dialog behind every destructive admin action (CLAUDE.md §9: "Destructive
 * actions need typed confirmation"). Staff must type `confirmText` exactly — a code, a slug, a name —
 * before the action button enables, so a stray click can never delete anything. The action runs on
 * the server; on success `onDone` decides what happens next (refresh the list, go back to it).
 */
export function TypedConfirmDialog({
  open,
  onOpenChange,
  actionLabel,
  description,
  confirmText,
  onConfirm,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel: string;
  description: string;
  confirmText: string;
  onConfirm: (typed: string) => Promise<DangerResult>;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === confirmText;

  // Every opening starts empty. A controlled dialog with no Trigger never gets onOpenChange(true)
  // from Radix, so the reset happens here, on the closed → open change — otherwise the second image
  // deleted from the same list would open with "delete" already typed in.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
      setError(null);
    }
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm(typed.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogTitle className="font-display text-xl font-semibold text-ink">{actionLabel}?</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-ink-2">
          {description} Type <strong className="font-mono text-ink">{confirmText}</strong> to confirm.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !pending) run();
          }}
        >
          <Input
            aria-label={`Type ${confirmText} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-4 font-mono"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-crit">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="solid-crit" size="sm" disabled={!matches || pending}>
              {pending ? "Working…" : actionLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A destructive action at the foot of an edit page, behind `TypedConfirmDialog`. */
export function DangerZone({
  title,
  description,
  actionLabel,
  confirmText,
  onConfirm,
  onDone,
}: {
  title: string;
  description: string;
  actionLabel: string;
  confirmText: string;
  onConfirm: (typed: string) => Promise<DangerResult>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3 rounded-lg border border-crit/30 bg-crit/5 p-5">
      <h2 className="font-display text-lg font-semibold text-crit">{title}</h2>
      <p className="text-sm text-ink-2">{description}</p>
      <Button type="button" variant="solid-crit" size="sm" onClick={() => setOpen(true)}>
        {actionLabel}
      </Button>
      <TypedConfirmDialog
        open={open}
        onOpenChange={setOpen}
        actionLabel={actionLabel}
        description={description}
        confirmText={confirmText}
        onConfirm={onConfirm}
        onDone={onDone}
      />
    </section>
  );
}
