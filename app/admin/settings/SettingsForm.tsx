"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { AdminSettingsSnapshot } from "@/lib/db/queries/settings";
import { updateSettingsAction } from "./actions";

export function SettingsForm({ initial }: { initial: AdminSettingsSnapshot }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState({
    freeShippingThresholdRupees: String(initial.freeShippingThresholdPaise / 100),
    standardShippingRupees: String(initial.standardShippingPaise / 100),
    freeGiftThresholdRupees: initial.freeGiftThresholdPaise != null ? String(initial.freeGiftThresholdPaise / 100) : "",
    crossPillarBundleDiscountPercent: String(initial.crossPillarPercent),
    supportEmail: initial.supportEmail,
    businessName: initial.storeAddress.businessName,
    line1: initial.storeAddress.line1,
    city: initial.storeAddress.city,
    state: initial.storeAddress.state,
    pincode: initial.storeAddress.pincode,
    country: initial.storeAddress.country,
    phone: initial.storeAddress.phone,
    email: initial.storeAddress.email,
    gstin: initial.gstin,
    announcementBarText: initial.announcementBarText,
    maintenanceMode: initial.maintenanceMode,
    whatsappNumber: initial.whatsappNumber,
  });

  function set<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateSettingsAction({
        freeShippingThresholdRupees: Number(state.freeShippingThresholdRupees),
        standardShippingRupees: Number(state.standardShippingRupees),
        freeGiftThresholdRupees: state.freeGiftThresholdRupees.trim() === "" ? null : Number(state.freeGiftThresholdRupees),
        crossPillarBundleDiscountPercent: Number(state.crossPillarBundleDiscountPercent),
        supportEmail: state.supportEmail.trim(),
        businessName: state.businessName,
        line1: state.line1,
        city: state.city,
        state: state.state,
        pincode: state.pincode,
        country: state.country,
        phone: state.phone,
        email: state.email,
        gstin: state.gstin,
        announcementBarText: state.announcementBarText,
        maintenanceMode: state.maintenanceMode,
        whatsappNumber: state.whatsappNumber,
      });
      show({ title: result.ok ? "Saved" : "Failed", description: result.ok ? result.message : result.error, tone: result.ok ? "ok" : "crit" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold text-ink">Shipping</legend>
        <Field label="Free-shipping threshold (₹)">
          <Input type="number" min="0" step="1" value={state.freeShippingThresholdRupees} onChange={(e) => set("freeShippingThresholdRupees", e.target.value)} />
        </Field>
        <Field label="Standard shipping fee (₹)">
          <Input type="number" min="0" step="1" value={state.standardShippingRupees} onChange={(e) => set("standardShippingRupees", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold text-ink">Offers</legend>
        <Field label="Free gift on orders of (₹)" hint="Shoppers choose a free gift once their order reaches this amount. Leave empty to switch the free-gift offer off everywhere.">
          <Input type="number" min="1" step="1" value={state.freeGiftThresholdRupees} onChange={(e) => set("freeGiftThresholdRupees", e.target.value)} placeholder="Off" />
        </Field>
        <Field
          label="Tea + Masala bundle discount (%)"
          hint={`Automatic discount on the cheapest item when a cart has both a tea and a masala. 0 switches it off.${initial.crossPillarConfigured ? "" : " (Not set yet — the site is using 10% until you save a value.)"}`}
        >
          <Input type="number" min="0" max="50" step="1" value={state.crossPillarBundleDiscountPercent} onChange={(e) => set("crossPillarBundleDiscountPercent", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold text-ink">Store address &amp; contact</legend>
        <Field label="Business name">
          <Input value={state.businessName} onChange={(e) => set("businessName", e.target.value)} />
        </Field>
        <Field label="Address line 1">
          <Input value={state.line1} onChange={(e) => set("line1", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={state.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <Input value={state.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Pincode">
            <Input value={state.pincode} onChange={(e) => set("pincode", e.target.value)} />
          </Field>
          <Field label="Country">
            <Input value={state.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
        </div>
        <Field label="Phone">
          <Input value={state.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email" hint={`Also where you'll get a "new order" email every time a customer checks out.`}>
          <Input type="email" value={state.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Support / sales email (optional)" hint="Shown as the contact address on the corporate gifting page.">
          <Input type="email" value={state.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
        </Field>
        <Field label="GSTIN">
          <Input value={state.gstin} onChange={(e) => set("gstin", e.target.value)} />
        </Field>
        <Field label="WhatsApp number" hint="Digits only, with country code (e.g. 917710219958) — no + or spaces. Powers the floating chat button.">
          <Input value={state.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold text-ink">Site banners</legend>
        <Field
          label="Announcement-bar text"
          hint="The strip at the very top of every page. Leave empty for “Free shipping over ₹X”. Type {free_shipping} to show the current free-shipping amount."
        >
          <Textarea rows={2} value={state.announcementBarText} onChange={(e) => set("announcementBarText", e.target.value)} placeholder="Free shipping over {free_shipping}" />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <Checkbox checked={state.maintenanceMode} onCheckedChange={(checked) => set("maintenanceMode", checked === true)} className="mt-0.5" />
          <span>
            Maintenance mode — close the shop temporarily
            <span className="block text-xs text-ink-3">Shoppers see a “back shortly” page with your contact details. You and other staff still see the full site and the admin.</span>
          </span>
        </label>
      </fieldset>

      <Button type="submit" loading={pending}>
        Save settings
      </Button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
