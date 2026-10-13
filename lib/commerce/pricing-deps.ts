import "server-only";

/**
 * The real, Postgres-backed `PricingDeps` for `lib/commerce/pricing.ts#computePricing`. Kept in
 * its own server-only module (rather than living inside pricing.ts itself) purely so pricing.ts
 * can stay free of any runtime lib/db/ import — see that file's header comment for why that
 * separation is what makes computePricing unit-testable without a database.
 */
import { getVariantsForPricing } from "@/lib/db/queries/variants";
import { countPaidCouponUsesByEmail, getCouponByCode, hasPaidOrderForEmail } from "@/lib/db/queries/coupons";
import {
  getCrossPillarBundleDiscountPercent,
  getFreeGiftThresholdPaise,
  getFreeShippingThresholdPaise,
  getStandardShippingPaise,
} from "@/lib/db/queries/settings";
import type { PricingDeps } from "./pricing";

export const defaultPricingDeps: PricingDeps = {
  getVariants: getVariantsForPricing,
  getCoupon: getCouponByCode,
  getFreeShippingThresholdPaise,
  getStandardShippingPaise,
  getCrossPillarBundleDiscountPercent,
  countPaidCouponUsesByEmail,
  hasPaidOrderForEmail,
  getFreeGiftThresholdPaise,
};
