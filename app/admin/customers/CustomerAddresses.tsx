"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { TypedConfirmDialog } from "@/components/admin/DangerZone";
import { INDIAN_STATES } from "@/lib/commerce/address";
import type { AddressRecord } from "@/lib/db/queries/addresses";
import { deleteCustomerAddressAction, saveCustomerAddressAction, setDefaultCustomerAddressAction } from "./actions";

type Draft = { label: string; name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string; isDefault: boolean };

const EMPTY: Draft = { label: "", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };

function toDraft(a: AddressRecord): Draft {
  return { label: a.label ?? "", name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault };
}

/** A customer's saved addresses: add, edit, set default, delete (typed confirmation). */
export function CustomerAddresses({ customerId, addresses }: { customerId: number; addresses: AddressRecord[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  function open(target: number | "new") {
    setError(null);
    setEditing(target);
    const existing = target === "new" ? null : addresses.find((a) => a.id === target);
    setDraft(existing ? toDraft(existing) : { ...EMPTY, isDefault: addresses.length === 0 });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerAddressAction(customerId, editing === "new" ? null : (editing as number), {
        ...draft,
        label: draft.label || null,
        line2: draft.line2 || undefined,
        state: draft.state as (typeof INDIAN_STATES)[number],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  const field = (key: keyof Draft, label: string, extra: Record<string, string> = {}) => (
    <div>
      <label htmlFor={`addr-${key}`} className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      <Input id={`addr-${key}`} value={draft[key] as string} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} {...extra} />
    </div>
  );

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Addresses ({addresses.length})</h2>
        {editing == null && (
          <Button type="button" variant="outline" size="sm" onClick={() => open("new")}>
            Add address
          </Button>
        )}
      </div>

      {addresses.length === 0 && editing == null && <p className="mt-2 text-sm text-ink-3">No saved addresses.</p>}
      <ul className="mt-3 space-y-3">
        {addresses.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 text-sm text-ink-2">
            <div>
              <span className="font-medium text-ink">{a.label ? `${a.label} — ` : ""}{a.name}</span> · {a.phone}
              {a.isDefault && <Badge tone="gold" className="ml-2">Default</Badge>}
              <br />
              {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}
            </div>
            <div className="flex gap-3">
              <button type="button" className="text-sm font-medium text-brew-1 hover:underline" onClick={() => open(a.id)}>Edit</button>
              {!a.isDefault && (
                <button
                  type="button"
                  className="text-sm font-medium text-ink-2 hover:underline"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const r = await setDefaultCustomerAddressAction(customerId, a.id);
                    if (!r.ok) setError(r.error);
                    router.refresh();
                  })}
                >
                  Make default
                </button>
              )}
              <button type="button" className="text-sm font-medium text-crit hover:underline" onClick={() => setDeleting(a.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      {editing != null && (
        <div className="mt-4 space-y-3 rounded-md border border-line bg-surface-2/50 p-4">
          <p className="text-sm font-semibold text-ink">{editing === "new" ? "New address" : "Edit address"}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("label", "Label (optional, e.g. Home)")}
            {field("name", "Recipient name")}
            {field("phone", "Mobile number", { inputMode: "tel" })}
            {field("pincode", "Pincode", { inputMode: "numeric" })}
          </div>
          {field("line1", "Address line 1")}
          {field("line2", "Address line 2 (optional)")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("city", "City")}
            <div>
              <label htmlFor="addr-state" className="mb-1 block text-xs font-medium text-ink-2">State</label>
              <select id="addr-state" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} className="h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[0.95rem] text-ink">
                <option value="">Choose a state…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox checked={draft.isDefault} onCheckedChange={(c) => setDraft({ ...draft, isDefault: c === true })} />
            Default address
          </label>
          {error && <p role="alert" className="text-sm text-crit">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="solid-ink" size="sm" disabled={pending} onClick={save}>Save address</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {editing == null && error && <p role="alert" className="mt-3 text-sm text-crit">{error}</p>}

      <TypedConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        actionLabel="Delete address"
        description="The saved address is removed from the customer's account. Past orders keep their own copy."
        confirmText="delete"
        onConfirm={(typed) => deleteCustomerAddressAction(customerId, deleting!, typed)}
        onDone={() => {
          setDeleting(null);
          router.refresh();
        }}
      />
    </section>
  );
}
