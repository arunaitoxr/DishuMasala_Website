import { formatINR } from "@/lib/money";
import type { PricingResult } from "@/lib/commerce/pricing";

/** The subtotal/discount/shipping/total breakdown — rendered only from what the server last
 * confirmed (`pricing`), never computed here (CLAUDE.md §7.5). `null` (before the first
 * revalidation resolves) renders nothing rather than a guessed number. */
export function OrderSummary({ pricing }: { pricing: PricingResult | null }) {
  if (!pricing) {
    return <p className="text-sm text-ink-2">Calculating your total…</p>;
  }

  return (
  <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-2">Subtotal</dt>
        <dd className="tabular-nums text-ink">{formatINR(pricing.subtotalPaise)}</dd>
      </div>
      {pricing.discountPaise > 0 && (
        <div className="flex justify-between">
          <dt className="text-ink-2">Discount{pricing.couponCode ? ` (${pricing.couponCode})` : ""}</dt>
          <dd className="tabular-nums text-leaf">−{formatINR(pricing.discountPaise)}</dd>
        </div>
      )}
      {pricing.crossPillarApplied && (
        <div className="flex justify-between">
          <dt className="text-ink-2">Tea + Masala bundle discount</dt>
          <dd className="tabular-nums text-leaf">−{formatINR(pricing.crossPillarDiscountPaise)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-ink-2">Shipping</dt>
        <dd className="tabular-nums text-ink">{pricing.shippingPaise > 0 ? formatINR(pricing.shippingPaise) : "Free"}</dd>
      </div>
      <div className="mt-1 flex justify-between border-t border-line pt-2.5 text-base font-semibold">
        <dt className="text-ink">Total</dt>
        <dd className="tabular-nums text-ink">{formatINR(pricing.totalPaise)}</dd>
      </div>
      <p className="text-xs text-ink-2">Inclusive of all taxes (GST)</p>
    </dl>
  );
}
