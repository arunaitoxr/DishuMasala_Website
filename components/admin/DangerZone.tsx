"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

export type DangerResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * A destructive admin action behind a typed confirmation (CLAUDE.md §9: "Destructive actions need
 * typed confirmation"). Staff must type `confirmText` exactly — a code, a slug, a name — before the
 * action button enables; a stray click can never delete anything. The action runs on the server and
 * reports back; on success `onDone` decides where to go (usually back to the list).
 */
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
  onConfirm: () => Promise<DangerResult>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === confirmText;

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onDone();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-crit/30 bg-crit/5 p-5">
      <h2 className="font-display text-lg font-semibold text-crit">{title}</h2>
      <p className="text-sm text-ink-2">{description}</p>
      <Button
        type="button"
        variant="solid-crit"
        size="sm"
        onClick={() => {
          setTyped("");
          setError(null);
          setOpen(true);
        }}
      >
        {actionLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="font-display text-xl font-semibold text-ink">{actionLabel}?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-ink-2">
            {description} Type <strong className="font-mono text-ink">{confirmText}</strong> to confirm.
          </DialogDescription>
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
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="solid-crit" size="sm" disabled={!matches || pending} onClick={run}>
              {pending ? "Working…" : actionLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
