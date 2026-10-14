"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createCustomerAction, updateCustomerAction } from "./actions";

/** Add a customer, or edit an existing one's name, email (also their sign-in email) and mobile number. */
export function CustomerForm({
  mode,
  customer,
}: {
  mode: "create" | "edit";
  customer?: { id: number; name: string; email: string; phone: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const input = { name, email, phone: phone || null };
      const result = mode === "create" ? await createCustomerAction(input) : await updateCustomerAction(customer!.id, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      if (mode === "create" && "data" in result && result.data) router.push(`/admin/customers/${result.data.id}`);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{mode === "create" ? "Customer details" : "Contact details"}</h2>
      {error && <div role="alert" className="rounded-md border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">{error}</div>}
      {notice && <div role="status" className="rounded-md border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">{notice}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="custName" className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input id="custName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="custPhone" className="mb-1 block text-sm font-medium text-ink">Mobile number (optional)</label>
          <Input id="custPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" />
        </div>
      </div>
      <div>
        <label htmlFor="custEmail" className="mb-1 block text-sm font-medium text-ink">Email</label>
        <Input id="custEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="mt-1 text-xs text-ink-3">
          {mode === "create"
            ? "They sign in with this email and set their own password with “Forgot password”."
            : "This is also their sign-in email — changing it changes how they log in."}
        </p>
      </div>
      <Button type="button" variant="solid-ink" size="sm" disabled={pending} onClick={save}>
        {mode === "create" ? "Add customer" : "Save details"}
      </Button>
    </section>
  );
}
