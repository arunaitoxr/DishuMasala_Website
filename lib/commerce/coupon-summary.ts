import { formatINR, paise } from "@/lib/money";

/** The fields a coupon's one-line description needs — shared by the admin list, the form preview and
 * anything else that has to say what a coupon gives. */
export interface CouponTerms {
  kind: "percent" | "fixed";
  /** Percent: whole number. Fixed: paise. */
  value: number;
  maxDiscountPaise: number | null;
  minSpendPaise: number | null;
  firstOrderOnly: boolean;
}

/** "10% off, up to ₹100" / "₹50 off" — what the shopper gets, with the upper limit when there is one. */
export function couponDiscountLabel(c: Pick<CouponTerms, "kind" | "value" | "maxDiscountPaise">): string {
  if (c.kind === "fixed") return `${formatINR(paise(c.value))} off`;
  return c.maxDiscountPaise != null ? `${c.value}% off, up to ${formatINR(paise(c.maxDiscountPaise))}` : `${c.value}% off`;
}

/** The full terms in one line: discount, minimum spend, first-order rule. */
export function couponTermsLabel(c: CouponTerms): string {
  return [
    couponDiscountLabel(c),
    c.minSpendPaise != null && c.minSpendPaise > 0 ? `on orders of ${formatINR(paise(c.minSpendPaise))}+` : null,
    c.firstOrderOnly ? "first order only" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type CouponState = "active" | "inactive" | "scheduled" | "expired" | "used_up";

/** Whether a coupon would work right now — the same window/limit checks `validateCoupon` makes before
 * it looks at any cart. */
export function couponState(
  c: { active: boolean; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; usedCount: number },
  now: Date = new Date(),
): CouponState {
  if (!c.active) return "inactive";
  if (c.startsAt && now < new Date(c.startsAt)) return "scheduled";
  if (c.endsAt && now > new Date(c.endsAt)) return "expired";
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return "used_up";
  return "active";
}

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  active: "Active",
  inactive: "Off",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
};
