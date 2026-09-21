import { describe, expect, it } from "vitest";
import { paise } from "@/lib/money";
import {
  computeCouponDiscountPaise,
  computePricing,
  validateCoupon,
  type CouponContext,
  type PricingDeps,
} from "../pricing";
import type { CouponRow } from "@/lib/db/queries/coupons";
import type { VariantPricingRow } from "@/lib/db/queries/variants";

// A small fake catalogue — two products, one out-of-stock variant, one with a real (low) count.
const BLUE_500: VariantPricingRow = {
  variantId: 1,
  productId: 10,
  collectionId: 1,
  collectionSlug: "blue-tea",
  priority: 1,
  productName: "Blue Tea",
  sku: "BT-500",
  optionValue: "500g",
  mrpPaise: paise(60000),
  pricePaise: paise(50000),
  inStock: true,
  stockQty: null,
  imageStorageKey: "products/blue-tea/a.jpg",
};
const RED_250: VariantPricingRow = {
  variantId: 2,
  productId: 11,
  collectionId: 2,
  collectionSlug: "red-tea",
  priority: 2,
  productName: "Red Tea",
  sku: "RT-250",
  optionValue: "250g",
  mrpPaise: paise(30000),
  pricePaise: paise(25000),
  inStock: true,
  stockQty: 3,
  imageStorageKey: null,
};
const OUT_OF_STOCK: VariantPricingRow = {
  variantId: 3,
  productId: 12,
  collectionId: 5,
  collectionSlug: "spices",
  priority: 5,
  productName: "Turmeric",
  sku: "TU-100",
  optionValue: "100g",
  mrpPaise: paise(12000),
  pricePaise: paise(12000), // price == mrp, no discount chip case
  inStock: false,
  stockQty: null,
  imageStorageKey: null,
};
const CORIANDER_100: VariantPricingRow = {
  variantId: 4,
  productId: 13,
  collectionId: 5,
  collectionSlug: "spices",
  priority: 5,
  productName: "Coriander Powder",
  sku: "CP-100",
  optionValue: "100g",
  mrpPaise: paise(15000),
  pricePaise: paise(12000),
  inStock: true,
  stockQty: null,
  imageStorageKey: null,
};

// The real gift-eligible SKUs (2026-09-17 client rule) — an exact allowlist by SKU, not a generic
// "any spice" rule, so CORIANDER_100 above (sku "CP-100", not a real gift SKU) stays deliberately
// NOT gift-eligible, proving the match is by exact SKU, not by collection/size alone.
const CORIANDER_GIFT_100GM: VariantPricingRow = {
  variantId: 5,
  productId: 14,
  collectionId: 5,
  collectionSlug: "spices",
  priority: 2,
  productName: "Coriander Powder",
  sku: "0026-100-gm",
  optionValue: "100 gm",
  mrpPaise: paise(5500),
  pricePaise: paise(4800),
  inStock: true,
  stockQty: null,
  imageStorageKey: null,
};
const GARAM_MASALA_100GM: VariantPricingRow = {
  // Deliberately excluded from the gift allowlist (client rule: Coriander/Turmeric/Red Chilli
  // only, not Black Pepper or Garam Masala) — used to prove that exclusion below.
  variantId: 6,
  productId: 15,
  collectionId: 5,
  collectionSlug: "spices",
  priority: 3,
  productName: "Garam Masala Powder",
  sku: "0025-100-gm",
  optionValue: "100 gm",
  mrpPaise: paise(8500),
  pricePaise: paise(8500),
  inStock: true,
  stockQty: null,
  imageStorageKey: null,
};
const BLACK_TEA_250: VariantPricingRow = {
  variantId: 8,
  productId: 16,
  collectionId: 4,
  collectionSlug: "classic-teas",
  priority: 4,
  productName: "Classic Tea",
  sku: "CT-250",
  optionValue: "250g",
  mrpPaise: paise(12000),
  pricePaise: paise(9500),
  inStock: true,
  stockQty: null,
  imageStorageKey: null,
};
const BLUE_RED_TEA_COMBO: VariantPricingRow = {
  variantId: 9,
  productId: 17,
  collectionId: 6,
  collectionSlug: "tea-combos",
  productSlug: "blue-tea-red-tea-teabags-combo",
  priority: 4,
  productName: "Blue Tea + Red Tea",
  sku: "BR-COMBO",
  optionValue: "72 teabags",
  mrpPaise: paise(90000),
  pricePaise: paise(80000),
  inStock: true,
  stockQty: null,
  imageStorageKey: null,
};
const BLUE_TEA_GIFT_20GM: VariantPricingRow = {
  variantId: 7,
  productId: 16,
  collectionId: 1,
  collectionSlug: "blue-tea",
  priority: 1,
  productName: "Premium Herbal Blue Tea (loose)",
  sku: "0023-20-gm",
  optionValue: "20 gm",
  mrpPaise: paise(11500),
  pricePaise: paise(10346),
  inStock: true,
  stockQty: null,
  imageStorageKey: null,
};

const CATALOG = [BLUE_500, RED_250, OUT_OF_STOCK, CORIANDER_100, CORIANDER_GIFT_100GM, GARAM_MASALA_100GM, BLUE_TEA_GIFT_20GM, BLACK_TEA_250, BLUE_RED_TEA_COMBO];

const WELCOME5: CouponRow = {
  id: 1,
  code: "WELCOME5",
  kind: "percent",
  value: 5,
  minSpendPaise: null,
  maxDiscountPaise: null,
  firstOrderOnly: true,
  usageLimit: null,
  usedCount: 0,
  perUserLimit: null,
  startsAt: null,
  endsAt: null,
  active: true,
  appliesTo: null,
};

function fakeDeps(overrides: Partial<PricingDeps> = {}): PricingDeps {
  return {
    getVariants: async (ids) => CATALOG.filter((v) => ids.includes(v.variantId)),
    getCoupon: async (code) => (code.toUpperCase() === "WELCOME5" ? WELCOME5 : null),
    getFreeShippingThresholdPaise: async () => paise(50000),
    getStandardShippingPaise: async () => paise(5000),
    getCrossPillarBundleDiscountPercent: async () => 10,
    countCouponRedemptionsByEmail: async () => 0,
    hasAnyOrderForEmail: async () => false,
    getFreeGiftThresholdPaise: async () => paise(69900),
    ...overrides,
  };
}

describe("computePricing — subtotal/shipping/total recomputation", () => {
  it("computes subtotal, savings and total for a simple cart with no coupon", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 2, qty: 2 }] },
      fakeDeps(),
    );
    // subtotal = 50000 + 2*25000 = 100000
    expect(result.subtotalPaise).toBe(100000);
    // savings = (60000-50000)*1 + (30000-25000)*2 = 10000 + 10000 = 20000
    expect(result.savingsPaise).toBe(20000);
    expect(result.discountPaise).toBe(0);
    expect(result.shippingPaise).toBe(0); // over the 50000 threshold
    expect(result.totalPaise).toBe(100000);
    expect(result.clean).toBe(true);
  });

  it("charges standard shipping under the free-shipping threshold and reports rupees remaining", async () => {
    const result = await computePricing({ lines: [{ variantId: 2, qty: 1 }] }, fakeDeps());
    expect(result.subtotalPaise).toBe(25000);
    expect(result.shippingPaise).toBe(5000);
    expect(result.rupeesToFreeShippingPaise).toBe(25000);
    expect(result.totalPaise).toBe(30000);
  });

  it("merges duplicate lines for the same variant into one priced line", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 1, qty: 2 }] },
      fakeDeps(),
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].qty).toBe(3);
    expect(result.subtotalPaise).toBe(150000);
  });

  it("drops an unknown variant id and reports variant_not_found, pricing the rest of the cart", async () => {
    const result = await computePricing({ lines: [{ variantId: 999, qty: 1 }, { variantId: 1, qty: 1 }] }, fakeDeps());
    expect(result.issues).toContainEqual({ type: "variant_not_found", variantId: 999 });
    expect(result.subtotalPaise).toBe(50000);
    expect(result.clean).toBe(false);
  });

  it("drops an out-of-stock variant and reports it, never pricing it", async () => {
    const result = await computePricing({ lines: [{ variantId: 3, qty: 1 }] }, fakeDeps());
    expect(result.issues).toContainEqual({ type: "out_of_stock", variantId: 3, productName: "Turmeric" });
    expect(result.subtotalPaise).toBe(0);
    expect(result.clean).toBe(false);
  });

  it("clamps quantity to real stock and reports insufficient_stock with what's actually available", async () => {
    const result = await computePricing({ lines: [{ variantId: 2, qty: 10 }] }, fakeDeps());
    expect(result.issues).toContainEqual({
      type: "insufficient_stock",
      variantId: 2,
      productName: "Red Tea",
      requestedQty: 10,
      availableQty: 3,
    });
    expect(result.lines[0].qty).toBe(3);
    expect(result.subtotalPaise).toBe(75000);
    expect(result.clean).toBe(false);
  });

  it("this IS the manipulated-price defence: the client's own numbers are never read — a caller passing only ids/qty gets a server-computed total regardless of what a tampered UI might have displayed", async () => {
    // No priceOverride field exists on PricingLineInput at all — there is nothing to tamper.
    const result = await computePricing({ lines: [{ variantId: 1, qty: 1 }] }, fakeDeps());
    expect(result.totalPaise).toBe(50000); // the real server price, not whatever a client might claim
  });
});

describe("computePricing — coupon application end to end", () => {
  it("applies WELCOME5 (5% off) for a first-time email and reports the accepted code", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }], couponCode: "welcome5", email: "new@example.com" },
      fakeDeps(),
    );
    expect(result.couponCode).toBe("WELCOME5");
    expect(result.discountPaise).toBe(2500); // 5% of 50000
    expect(result.totalPaise).toBe(47500);
    expect(result.clean).toBe(true);
  });

  it("rejects WELCOME5 for a returning email (first-order-only) and reports why", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }], couponCode: "WELCOME5", email: "returning@example.com" },
      fakeDeps({ hasAnyOrderForEmail: async () => true }),
    );
    expect(result.couponCode).toBeNull();
    expect(result.discountPaise).toBe(0);
    expect(result.issues).toContainEqual({ type: "coupon_invalid", code: "WELCOME5", reason: "first_order_only" });
    expect(result.clean).toBe(false);
  });

  it("rejects an unknown coupon code", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }], couponCode: "NOPE10", email: "a@example.com" },
      fakeDeps(),
    );
    expect(result.issues).toContainEqual({ type: "coupon_invalid", code: "NOPE10", reason: "not_found" });
  });
});

describe("computePricing — automatic cross-pillar bundle discount", () => {
  it("applies no cross-pillar discount for a single-pillar (Tea only) cart", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 2, qty: 1 }] }, // Blue Tea + Red Tea, both Tea
      fakeDeps(),
    );
    expect(result.crossPillarDiscountPaise).toBe(0);
    expect(result.crossPillarApplied).toBe(false);
  });

  it("applies no cross-pillar discount for a single-pillar (Masala only) cart", async () => {
    const result = await computePricing({ lines: [{ variantId: 4, qty: 2 }] }, fakeDeps());
    expect(result.crossPillarDiscountPaise).toBe(0);
    expect(result.crossPillarApplied).toBe(false);
  });

  it("applies the cross-pillar discount when the cart spans Tea and Masala, as 10% of the cheapest unit", async () => {
    // Blue Tea (50000) + Coriander (12000) — cheapest unit is the Coriander at 12000.
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 4, qty: 1 }] },
      fakeDeps(),
    );
    expect(result.crossPillarApplied).toBe(true);
    expect(result.crossPillarDiscountPaise).toBe(1200); // 10% of 12000
    expect(result.subtotalPaise).toBe(62000);
    expect(result.totalPaise).toBe(62000 - 1200); // over free-shipping threshold, no shipping
  });

  it("reads the discount percent from settings (deps), never a literal — a different configured rate changes the result", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 4, qty: 1 }] },
      fakeDeps({ getCrossPillarBundleDiscountPercent: async () => 20 }),
    );
    expect(result.crossPillarDiscountPaise).toBe(2400); // 20% of 12000
  });

  it("is server-recomputed and ignores anything the client might claim — no field on PricingInput accepts a discount amount", async () => {
    // PricingInput only ever carries variantId/qty/couponCode/email; there is no way for a caller
    // to pass a discount value in, so a "client-supplied discount" cannot even be expressed, let
    // alone honoured. This proves the cross-pillar cart still ends up at the real server figure.
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 4, qty: 1 }] } as never,
      fakeDeps(),
    );
    expect(result.crossPillarDiscountPaise).toBe(1200);
    expect(result.totalPaise).toBe(62000 - 1200);
  });

  it("drops out when the qualifying Masala line is out of stock, since it never reaches priced lines", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 3, qty: 1 }] }, // Blue Tea + out-of-stock Turmeric
      fakeDeps(),
    );
    expect(result.crossPillarDiscountPaise).toBe(0);
    expect(result.crossPillarApplied).toBe(false);
  });
});

describe("computeCouponDiscountPaise", () => {
  it("computes a percent discount, rounded", () => {
    expect(computeCouponDiscountPaise(WELCOME5, paise(9999))).toBe(500); // round(9999*0.05)=500
  });

  it("computes a fixed discount in paise directly", () => {
    const fixed: CouponRow = { ...WELCOME5, kind: "fixed", value: 10000 };
    expect(computeCouponDiscountPaise(fixed, paise(50000))).toBe(10000);
  });

  it("caps a discount at maxDiscountPaise", () => {
    const capped: CouponRow = { ...WELCOME5, maxDiscountPaise: 1000 };
    expect(computeCouponDiscountPaise(capped, paise(100000))).toBe(1000); // 5% would be 5000, capped to 1000
  });

  it("never discounts more than the subtotal", () => {
    const fixed: CouponRow = { ...WELCOME5, kind: "fixed", value: 999999 };
    expect(computeCouponDiscountPaise(fixed, paise(1000))).toBe(1000);
  });
});

describe("validateCoupon — every rule as its own case", () => {
  const baseCtx: CouponContext = {
    subtotalPaise: paise(100000),
    now: new Date("2026-06-01T00:00:00Z"),
    priorOrderExists: false,
    totalRedemptions: 0,
    userRedemptions: 0,
    hasEmail: true,
    cartProductIds: [10],
    cartCollectionIds: [1],
  };

  it("existence: null coupon is rejected as not_found", () => {
    expect(validateCoupon(null, baseCtx)).toEqual({ ok: false, reason: "not_found" });
  });

  it("active window: an inactive coupon is rejected", () => {
    expect(validateCoupon({ ...WELCOME5, active: false }, baseCtx)).toEqual({ ok: false, reason: "inactive" });
  });

  it("active window: a coupon that hasn't started yet is rejected", () => {
    const coupon: CouponRow = { ...WELCOME5, startsAt: new Date("2027-01-01") };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: false, reason: "not_started" });
  });

  it("active window: an expired coupon is rejected", () => {
    const coupon: CouponRow = { ...WELCOME5, endsAt: new Date("2025-01-01") };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: false, reason: "expired" });
  });

  it("active window: within starts_at/ends_at is accepted", () => {
    const coupon: CouponRow = { ...WELCOME5, startsAt: new Date("2026-01-01"), endsAt: new Date("2026-12-31") };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: true });
  });

  it("minimum spend: below min_spend_paise is rejected", () => {
    const coupon: CouponRow = { ...WELCOME5, minSpendPaise: 200000 };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: false, reason: "min_spend" });
  });

  it("minimum spend: at or above min_spend_paise is accepted", () => {
    const coupon: CouponRow = { ...WELCOME5, minSpendPaise: 100000 };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: true });
  });

  it("overall usage limit: at the limit is rejected", () => {
    const coupon: CouponRow = { ...WELCOME5, usageLimit: 10, usedCount: 10 };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: false, reason: "usage_limit" });
  });

  it("overall usage limit: under the limit is accepted", () => {
    const coupon: CouponRow = { ...WELCOME5, usageLimit: 10, usedCount: 9 };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: true });
  });

  it("per-user limit: at the user's limit is rejected", () => {
    const coupon: CouponRow = { ...WELCOME5, firstOrderOnly: false, perUserLimit: 1 };
    expect(validateCoupon(coupon, { ...baseCtx, userRedemptions: 1 })).toEqual({ ok: false, reason: "per_user_limit" });
  });

  it("per-user limit: with no email yet, a per-user-limited coupon can't be confirmed valid", () => {
    const coupon: CouponRow = { ...WELCOME5, firstOrderOnly: false, perUserLimit: 1 };
    expect(validateCoupon(coupon, { ...baseCtx, hasEmail: false })).toEqual({ ok: false, reason: "per_user_limit" });
  });

  it("first-order-only: a returning email is rejected", () => {
    expect(validateCoupon(WELCOME5, { ...baseCtx, priorOrderExists: true })).toEqual({
      ok: false,
      reason: "first_order_only",
    });
  });

  it("first-order-only: a genuinely first-time email is accepted", () => {
    expect(validateCoupon(WELCOME5, { ...baseCtx, priorOrderExists: false })).toEqual({ ok: true });
  });

  it("applies_to: a cart containing a non-eligible product is rejected", () => {
    const coupon: CouponRow = { ...WELCOME5, appliesTo: { productIds: [999] } };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: false, reason: "not_applicable" });
  });

  it("applies_to: a cart entirely within the eligible collection is accepted", () => {
    const coupon: CouponRow = { ...WELCOME5, appliesTo: { collectionIds: [1] } };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: true });
  });

  it("applies_to: no restriction set at all is accepted", () => {
    const coupon: CouponRow = { ...WELCOME5, appliesTo: null };
    expect(validateCoupon(coupon, baseCtx)).toEqual({ ok: true });
  });
});

describe("free gift line (2026-09-17 client rules: allowlisted SKU + not-already-in-cart pillar)", () => {
  it("is honoured once the rest of the cart clears the real threshold, from a different pillar", async () => {
    const result = await computePricing(
      {
        lines: [
          { variantId: 1, qty: 2 }, // Blue Tea, 2x ₹500 = ₹1000, well above ₹699
          { variantId: 5, qty: 1, isGift: true }, // Coriander 100g — a real gift SKU, spices pillar
        ],
      },
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    const gift = result.lines.find((l) => l.isGift);
    expect(gift).toBeDefined();
    expect(gift?.unitPricePaise).toBe(0);
    expect(gift?.mrpPaise).toBe(paise(5500)); // real MRP still shown, struck through
    expect(gift?.qty).toBe(1);
    expect(result.hasFreeGift).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("is dropped, with an explanatory issue, when the rest of the cart is below the threshold", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 5, qty: 1, isGift: true }] }, // ₹500 < ₹699
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    expect(result.lines.some((l) => l.isGift)).toBe(false);
    expect(result.hasFreeGift).toBe(false);
    expect(result.issues).toContainEqual({ type: "gift_threshold_not_met", variantId: 5, thresholdPaise: paise(69900) });
  });

  it("rejects a gift request for a variant that isn't on the real allowlist (e.g. Garam Masala)", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 2 }, { variantId: 6, qty: 1, isGift: true }] }, // Garam Masala — deliberately not a gift SKU
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    expect(result.lines.some((l) => l.isGift)).toBe(false);
    expect(result.issues.some((i) => i.type === "gift_not_eligible")).toBe(true);
  });

  it("rejects a gift from the SAME pillar as what's already being bought (Blue Tea buyer requesting the Blue Tea gift)", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 2 }, { variantId: 7, qty: 1, isGift: true }] }, // both Blue Tea pillar
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    expect(result.lines.some((l) => l.isGift)).toBe(false);
    expect(result.issues.some((i) => i.type === "gift_not_eligible")).toBe(true);
  });

  it("honours ANY allowlisted gift once the cart already holds every pillar (client rule, 2026-09-20)", async () => {
    const result = await computePricing(
      {
        lines: [
          { variantId: 1, qty: 1 }, // Blue Tea ₹500
          { variantId: 2, qty: 1 }, // Red Tea ₹250
          { variantId: 4, qty: 1 }, // Spices (Coriander, not a gift SKU) ₹120
          { variantId: 8, qty: 1 }, // Black Tea ₹95
          { variantId: 7, qty: 1, isGift: true }, // Blue Tea 20 gm gift — same pillar as a paid line, but all four are present
        ],
      },
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    expect(result.lines.some((l) => l.isGift && l.variantId === 7)).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("counts a tea combo as the teas it contains (a Blue + Red combo blocks the Blue Tea gift, allows Coriander)", async () => {
    const deps = fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) });
    const blueGift = await computePricing({ lines: [{ variantId: 9, qty: 1 }, { variantId: 7, qty: 1, isGift: true }] }, deps);
    expect(blueGift.lines.some((l) => l.isGift)).toBe(false);
    expect(blueGift.issues.some((i) => i.type === "gift_not_eligible")).toBe(true);
    const spiceGift = await computePricing({ lines: [{ variantId: 9, qty: 1 }, { variantId: 5, qty: 1, isGift: true }] }, deps);
    expect(spiceGift.lines.some((l) => l.isGift && l.variantId === 5)).toBe(true);
  });

  it("still rejects a same-pillar gift while the cart is missing a pillar", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 1 }, { variantId: 2, qty: 1 }, { variantId: 8, qty: 1 }, { variantId: 7, qty: 1, isGift: true }] }, // no spices in the cart
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    expect(result.lines.some((l) => l.isGift)).toBe(false);
    expect(result.issues.some((i) => i.type === "gift_not_eligible")).toBe(true);
  });

  it("honours a gift from a genuinely different pillar (Blue Tea buyer requesting the Coriander gift)", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 2 }, { variantId: 5, qty: 1, isGift: true }] },
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900) }),
    );
    expect(result.lines.some((l) => l.isGift && l.variantId === 5)).toBe(true);
  });

  it("never grants a free gift when no threshold is configured", async () => {
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 5 }, { variantId: 5, qty: 1, isGift: true }] },
      fakeDeps({ getFreeGiftThresholdPaise: async () => null }),
    );
    expect(result.lines.some((l) => l.isGift)).toBe(false);
    expect(result.freeGiftThresholdPaise).toBeNull();
  });

  it("a free gift is excluded from the cross-pillar Tea+Masala bundle discount trigger", async () => {
    // Only Tea in the paid cart; the gift is a Masala-pillar item but must not count as "cart has
    // a masala line" for the bundle discount — that discount is for a real Masala purchase.
    const result = await computePricing(
      { lines: [{ variantId: 1, qty: 2 }, { variantId: 5, qty: 1, isGift: true }] },
      fakeDeps({ getFreeGiftThresholdPaise: async () => paise(69900), getCrossPillarBundleDiscountPercent: async () => 10 }),
    );
    expect(result.crossPillarApplied).toBe(false);
    expect(result.crossPillarDiscountPaise).toBe(0);
  });
});
