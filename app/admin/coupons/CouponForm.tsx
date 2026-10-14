"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import type { AdminCouponRow } from "@/lib/db/queries/admin-coupons";
import { toISTDateTimeLocal } from "@/lib/dates";
import { couponTermsLabel } from "@/lib/commerce/coupon-summary";
import { createCouponAction, updateCouponAction, checkCouponCodeAvailableAction } from "./actions";

interface Picker {
  products: { id: number; name: string }[];
  collections: { id: number; title: string }[];
}

function parseAppliesTo(v: unknown): { productIds: number[]; collectionIds: number[] } {
  if (v == null || typeof v !== "object") return { productIds: [], collectionIds: [] };
  const o = v as Record<string, unknown>;
  return {
    productIds: Array.isArray(o.productIds) ? o.productIds.filter((x): x is number => typeof x === "number") : [],
    collectionIds: Array.isArray(o.collectionIds) ? o.collectionIds.filter((x): x is number => typeof x === "number") : [],
  };
}

export function CouponForm({ mode, coupon, picker }: { mode: "create" | "edit"; coupon?: AdminCouponRow; picker: Picker }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const initialApplies = parseAppliesTo(coupon?.appliesTo);

  const [code, setCode] = useState(coupon?.code ?? "");
  const codeLocked = mode === "edit" && (coupon?.usedCount ?? 0) > 0;
  const [kind, setKind] = useState<"percent" | "fixed">(coupon?.kind ?? "percent");
  const [value, setValue] = useState(coupon ? (coupon.kind === "fixed" ? coupon.value / 100 : coupon.value) : 5);
  const [minSpendRupees, setMinSpendRupees] = useState(coupon?.minSpendPaise != null ? coupon.minSpendPaise / 100 : "");
  const [maxDiscountRupees, setMaxDiscountRupees] = useState(coupon?.maxDiscountPaise != null ? coupon.maxDiscountPaise / 100 : "");
  const [firstOrderOnly, setFirstOrderOnly] = useState(coupon?.firstOrderOnly ?? false);
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit != null ? String(coupon.usageLimit) : "");
  const [perUserLimit, setPerUserLimit] = useState(coupon?.perUserLimit != null ? String(coupon.perUserLimit) : "");
  // Shown and typed in IST (lib/dates.ts) — the same string on the server and in the browser.
  const [startsAt, setStartsAt] = useState(toISTDateTimeLocal(coupon?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toISTDateTimeLocal(coupon?.endsAt ?? null));
  const [active, setActive] = useState(coupon?.active ?? true);
  const [productIds, setProductIds] = useState<number[]>(initialApplies.productIds);
  const [collectionIds, setCollectionIds] = useState<number[]>(initialApplies.collectionIds);

  async function handleCodeBlur() {
    if (!code) return;
    const res = await checkCouponCodeAvailableAction(code, coupon?.id);
    if (!res.available) setError(`The code "${code.toUpperCase()}" is already in use.`);
    else if (error?.startsWith("The code")) setError(null);
  }

  const preview = couponTermsLabel({
    kind,
    value: kind === "fixed" ? Math.round(Number(value) * 100) : Number(value),
    maxDiscountPaise: kind === "percent" && maxDiscountRupees !== "" ? Math.round(Number(maxDiscountRupees) * 100) : null,
    minSpendPaise: minSpendRupees !== "" ? Math.round(Number(minSpendRupees) * 100) : null,
    firstOrderOnly,
  });

  function toggle(list: number[], id: number, setter: (v: number[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function handleSave() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const payload = {
        code,
        kind,
        value: Number(value),
        minSpendRupees: minSpendRupees === "" ? null : Number(minSpendRupees),
        maxDiscountRupees: maxDiscountRupees === "" ? null : Number(maxDiscountRupees),
        firstOrderOnly,
        usageLimit: usageLimit === "" ? null : Number(usageLimit),
        perUserLimit: perUserLimit === "" ? null : Number(perUserLimit),
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        active,
        productIds,
        collectionIds,
      };
      const result = mode === "create" ? await createCouponAction(payload) : await updateCouponAction(coupon!.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      if (mode === "create" && "data" in result && result.data) router.push(`/admin/coupons/${result.data.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && <div role="alert" className="rounded-md border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">{error}</div>}
      {notice && <div role="status" className="rounded-md border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">{notice}</div>}

      <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink" aria-live="polite">
          <span className="font-mono font-semibold">{code || "CODE"}</span> — {preview}
        </p>
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium text-ink">Code</label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={handleCodeBlur}
            readOnly={codeLocked}
            aria-describedby={codeLocked ? "code-hint" : undefined}
            className="font-mono"
          />
          {codeLocked && (
            <p id="code-hint" className="mt-1 text-xs text-ink-3">
              This code has been used on orders, so it can&apos;t be renamed. Create a new coupon for a new code.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="kind" className="mb-1 block text-sm font-medium text-ink">Kind</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")} className="h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[0.95rem] text-ink">
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </div>
          <div>
            <label htmlFor="value" className="mb-1 block text-sm font-medium text-ink">{kind === "percent" ? "Percent off (1–100)" : "Amount off (₹)"}</label>
            <Input id="value" type="number" min={kind === "percent" ? 1 : 0.01} max={kind === "percent" ? 100 : undefined} step={kind === "percent" ? 1 : 0.01} value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="minSpend" className="mb-1 block text-sm font-medium text-ink">Minimum spend (₹, optional)</label>
            <Input id="minSpend" type="number" value={minSpendRupees} onChange={(e) => setMinSpendRupees(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          {kind === "percent" && (
            <div>
              <label htmlFor="maxDiscount" className="mb-1 block text-sm font-medium text-ink">Upper limit — max discount (₹, optional)</label>
              <Input id="maxDiscount" type="number" min={1} step={1} value={maxDiscountRupees} onChange={(e) => setMaxDiscountRupees(e.target.value === "" ? "" : Number(e.target.value))} aria-describedby="maxDiscount-hint" />
              <p id="maxDiscount-hint" className="mt-1 text-xs text-ink-3">However big the order, the discount never goes above this.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="usageLimit" className="mb-1 block text-sm font-medium text-ink">Total usage limit (optional)</label>
            <Input id="usageLimit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
          </div>
          <div>
            <label htmlFor="perUserLimit" className="mb-1 block text-sm font-medium text-ink">Per-user limit (optional)</label>
            <Input id="perUserLimit" type="number" value={perUserLimit} onChange={(e) => setPerUserLimit(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="mb-1 block text-sm font-medium text-ink">Starts at, IST (optional)</label>
            <Input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label htmlFor="endsAt" className="mb-1 block text-sm font-medium text-ink">Ends at, IST (optional)</label>
            <Input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox checked={firstOrderOnly} onCheckedChange={(c) => setFirstOrderOnly(c === true)} />
          First order only
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
          Active
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Applies to</h2>
        <p className="text-sm text-ink-2">Leave both empty for &quot;applies to everything&quot;.</p>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Collections</p>
          <div className="flex flex-wrap gap-2">
            {picker.collections.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                <Checkbox checked={collectionIds.includes(c.id)} onCheckedChange={() => toggle(collectionIds, c.id, setCollectionIds)} />
                {c.title}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Products</p>
          <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {picker.products.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                <Checkbox checked={productIds.includes(p.id)} onCheckedChange={() => toggle(productIds, p.id, setProductIds)} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      </section>

      <Button type="button" variant="solid-ink" disabled={pending} onClick={handleSave}>
        {mode === "create" ? "Create coupon" : "Save changes"}
      </Button>
    </div>
  );
}
