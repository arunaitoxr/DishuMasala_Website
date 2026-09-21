/**
 * The single pricing engine (CLAUDE.md §7.5 / PROMPTS.md Phase 5 item 3): every surface that
 * needs a price — cart validation, checkout, the Razorpay order amount, the confirmation email,
 * and any future admin surface — calls `computePricing`. No other file does its own subtotal,
 * discount or total arithmetic; grep the codebase to confirm.
 *
 * This module has no "server-only" import and no runtime drizzle import of its own (CLAUDE.md
 * §3.2: only lib/db/ may import drizzle) — every import of a lib/db/queries module below is
 * `import type` only, erased at compile time, so loading this file never touches Postgres or the
 * "server-only" guard. It reads variants/coupons through an injected `PricingDeps` instead; real
 * callers get `defaultPricingDeps` from `lib/commerce/pricing-deps.ts` (a genuinely server-only
 * module, kept separate for exactly this reason), while tests inject a fake `PricingDeps` and
 * assert on arithmetic alone with no database in the loop at all.
 */
import { paise, sumPaise, type Paise } from "@/lib/money";
import { pillarsOf, type Pillar } from "@/lib/pillars";
import type { VariantPricingRow } from "@/lib/db/queries/variants";
import type { CouponRow } from "@/lib/db/queries/coupons";
import { TEA_COLLECTION_SLUGS, MASALA_COLLECTION_SLUGS } from "@/lib/nav";

export interface PricingLineInput {
  variantId: number;
  qty: number;
  /** Requests this line be priced as the free-gift-on-a-qualifying-order line (client request,
   * 2026-09-17) — never trusted at face value (CLAUDE.md §7.5): `computePricing` re-checks the
   * variant is actually gift-eligible (a real 100g spice variant) and that the REST of the cart
   * (excluding this line) already clears `getFreeGiftThresholdPaise()` before honouring it. At
   * most one gift line survives per cart; a second gift request, or a gift request for the wrong
   * kind of variant, or one made below the threshold, is dropped with a `PricingIssue` explaining
   * why, never silently repriced as a normal paid line. */
  isGift?: boolean;
}

export interface PricingInput {
  lines: PricingLineInput[];
  /** Coupon code as typed by the shopper, or null/undefined for none. */
  couponCode?: string | null;
  /** Guest identity — checkout email. Required for a coupon's per-user/first-order rules to be
   * evaluated at all; without it those rules simply can't be checked yet (e.g. cart-drawer
   * validation before the shopper has entered an email at checkout). */
  email?: string | null;
  /** Injection point for tests; production callers omit this and get real Postgres reads. */
  now?: Date;
}

export interface PricingLine {
  variantId: number;
  productId: number;
  collectionId: number;
  productName: string;
  /** Display-only (CLAUDE.md §7.2 priority) — passed through so the cart's upsell rail can sort
   * without a second query; never part of any money computation. */
  priority: number;
  collectionSlug: string;
  /** Carried so the client can classify a combo's pillars the same way the server does (lib/pillars.ts). */
  productSlug?: string;
  sku: string;
  optionValue: string;
  mrpPaise: Paise;
  unitPricePaise: Paise;
  /** Quantity actually priced — may be less than requested if stock forced a correction. */
  qty: number;
  requestedQty: number;
  lineTotalPaise: Paise;
  imageStorageKey: string | null;
  /** True only for the one surviving free-gift line, if any — `unitPricePaise` is always 0 for
   * such a line, `mrpPaise` is still the variant's real MRP (so the UI can show it struck through
   * next to "FREE"). Excluded from coupon `applies_to`/cross-pillar-bundle eligibility checks
   * below so a free item can't be used to unlock a discount it didn't actually qualify for. */
  isGift: boolean;
}

export type PricingIssue =
  | { type: "variant_not_found"; variantId: number }
  | { type: "out_of_stock"; variantId: number; productName: string }
  | { type: "insufficient_stock"; variantId: number; productName: string; requestedQty: number; availableQty: number }
  | { type: "coupon_invalid"; code: string; reason: CouponRejectReason }
  | { type: "gift_not_eligible"; variantId: number }
  | { type: "gift_threshold_not_met"; variantId: number; thresholdPaise: Paise };

export type CouponRejectReason =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "min_spend"
  | "usage_limit"
  | "per_user_limit"
  | "first_order_only"
  | "not_applicable";

export interface PricingResult {
  lines: PricingLine[];
  subtotalPaise: Paise;
  discountPaise: Paise;
  /** The automatic cross-pillar bundle discount (CLAUDE.md §7.2's 2026-09-10 amendment) — a
   * distinct, server-computed line, deliberately never folded into `discountPaise`/`couponCode`:
   * those two are reserved for manually-entered coupon codes (the `coupons` table). This is
   * structural and automatic, has no code, and does not touch `coupons`/`coupon_redemptions`. */
  crossPillarDiscountPaise: Paise;
  /** True only when `crossPillarDiscountPaise > 0` — lets a UI show/hide the row without
   * re-deriving the rule itself. */
  crossPillarApplied: boolean;
  shippingPaise: Paise;
  totalPaise: Paise;
  /** Sum of (mrp - price) * qty across priced lines — "you saved ₹X vs MRP", independent of any coupon. */
  savingsPaise: Paise;
  couponCode: string | null;
  freeShippingThresholdPaise: Paise;
  rupeesToFreeShippingPaise: Paise;
  /** `null` until the free-gift promotion has a real settings value (lib/db/queries/settings.ts's
   * `getFreeGiftThresholdPaise`) — the cart UI uses this, not a client-side guess, to decide when
   * to show the "choose your free gift" popup/progress. */
  freeGiftThresholdPaise: Paise | null;
  /** True only when one of `lines` is the surviving free-gift line — a plain derived flag so a
   * component doesn't need to `.some(l => l.isGift)` itself. */
  hasFreeGift: boolean;
  issues: PricingIssue[];
  /** True only when every input line priced exactly as requested and any submitted coupon was
   * accepted — i.e. nothing needed correcting. Callers (checkout route) use this to decide whether
   * a client-submitted total may be trusted to match, or must be rejected with the corrected cart. */
  clean: boolean;
}

export interface PricingDeps {
  getVariants: (ids: number[]) => Promise<VariantPricingRow[]>;
  getCoupon: (code: string) => Promise<CouponRow | null>;
  getFreeShippingThresholdPaise: () => Promise<Paise>;
  getStandardShippingPaise: () => Promise<Paise>;
  /** Whole-number percent for the automatic cross-pillar bundle discount (CLAUDE.md §7.2's
   * 2026-09-10 amendment) — read from `settings`, never a hardcoded literal in this file. */
  getCrossPillarBundleDiscountPercent: () => Promise<number>;
  countCouponRedemptionsByEmail: (couponId: number, email: string) => Promise<number>;
  hasAnyOrderForEmail: (email: string) => Promise<boolean>;
  /** `null` (never a fabricated threshold) until the client's free-gift promotion actually has a
   * real settings value — see lib/db/queries/settings.ts's own doc for why. */
  getFreeGiftThresholdPaise: () => Promise<Paise | null>;
}

interface NormalizedLine {
  variantId: number;
  qty: number;
  isGift: boolean;
}

/** Merges duplicate variant ids in the input (two lines for the same variant is the same as one
 * line with the summed quantity), drops non-positive quantities, and — separately — collapses
 * every `isGift` request down to at most one candidate line (the first one seen): a cart can only
 * ever carry one free gift, so a client sending several is a bug or an attempted abuse, never a
 * cue to grant more than one. */
function normalizeLines(lines: PricingLineInput[]): NormalizedLine[] {
  const byVariant = new Map<number, { qty: number; isGift: boolean }>();
  let giftVariantId: number | null = null;
  for (const line of lines) {
    if (!Number.isInteger(line.variantId) || !Number.isInteger(line.qty) || line.qty <= 0) continue;
    const wantsGift = !!line.isGift && (giftVariantId === null || giftVariantId === line.variantId);
    if (wantsGift) giftVariantId = line.variantId;
    const existing = byVariant.get(line.variantId);
    byVariant.set(line.variantId, {
      qty: (existing?.qty ?? 0) + line.qty,
      isGift: (existing?.isGift ?? false) || wantsGift,
    });
  }
  return Array.from(byVariant, ([variantId, v]) => ({ variantId, qty: v.qty, isGift: v.isGift }));
}

/** A gift's "pillar" for the exclusion rule below — Tea's three pillars (blue-tea, red-tea,
 * classic-teas) plus spices, matching `lib/db/queries/free-gift.ts`'s own `GiftPillar` type. */
type GiftPillar = Pillar;

/** The exact SKUs the client chose as free-gift options (2026-09-17) — a fixed allowlist, not a
 * generic "any 100g spice" rule: only Coriander/Turmeric/Red Chilli (not Black Pepper or Garam
 * Masala) for spices, and a genuinely smaller "20 gm" pack for the two loose teas. Kept in sync by
 * hand with `lib/db/queries/free-gift.ts#GIFT_SKUS` (the menu shown) — this is the version that
 * actually gets enforced. */
const FREE_GIFT_SKUS: Record<string, GiftPillar> = {
  "0023-20-gm": "blue-tea",
  "0032-20-gm": "red-tea",
  "0026-100-gm": "spices",
  "0021-100-gm": "spices",
  "0022-100-gm": "spices",
  "0030-100-gm": "classic-teas",
  "0035-100-gm": "classic-teas",
};

/** How many distinct pillars the gift allowlist spans — a cart holding all of them may take any gift. */
const GIFT_PILLAR_COUNT = new Set(Object.values(FREE_GIFT_SKUS)).size;

function giftPillarOf(v: VariantPricingRow): GiftPillar | null {
  return FREE_GIFT_SKUS[v.sku] ?? null;
}

export interface CouponContext {
  subtotalPaise: Paise;
  now: Date;
  priorOrderExists: boolean;
  totalRedemptions: number;
  userRedemptions: number;
  hasEmail: boolean;
  /** Product/collection ids actually present in the priced cart, for `applies_to`. */
  cartProductIds: number[];
  cartCollectionIds: number[];
}

interface AppliesTo {
  productIds?: number[];
  collectionIds?: number[];
}

function parseAppliesTo(value: unknown): AppliesTo {
  if (value == null || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  return {
    productIds: Array.isArray(v.productIds) ? v.productIds.filter((x): x is number => typeof x === "number") : undefined,
    collectionIds: Array.isArray(v.collectionIds)
      ? v.collectionIds.filter((x): x is number => typeof x === "number")
      : undefined,
  };
}

/**
 * Validates one coupon against one rule at a time (each independently unit-tested per
 * PROMPTS.md's explicit "each as its own test case, not one giant test" instruction):
 * existence, active window, minimum spend, overall usage limit, per-user limit, first-order-only,
 * and any `applies_to` restriction. Pure — takes an already-fetched `CouponRow` and a pre-computed
 * context, does no I/O itself.
 */
export function validateCoupon(
  coupon: CouponRow | null,
  ctx: CouponContext,
): { ok: true } | { ok: false; reason: CouponRejectReason } {
  if (!coupon) return { ok: false, reason: "not_found" };
  if (!coupon.active) return { ok: false, reason: "inactive" };
  if (coupon.startsAt && ctx.now < coupon.startsAt) return { ok: false, reason: "not_started" };
  if (coupon.endsAt && ctx.now > coupon.endsAt) return { ok: false, reason: "expired" };
  if (coupon.minSpendPaise != null && ctx.subtotalPaise < coupon.minSpendPaise) {
    return { ok: false, reason: "min_spend" };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: "usage_limit" };
  }
  if (coupon.perUserLimit != null) {
    // Without an email we cannot know per-user usage — treat as not-yet-satisfiable rather than
    // silently allowing it (a guest who hasn't entered an email yet simply can't redeem a
    // per-user-limited coupon until they do).
    if (!ctx.hasEmail || ctx.userRedemptions >= coupon.perUserLimit) {
      return { ok: false, reason: "per_user_limit" };
    }
  }
  if (coupon.firstOrderOnly) {
    if (!ctx.hasEmail || ctx.priorOrderExists) return { ok: false, reason: "first_order_only" };
  }
  const restriction = parseAppliesTo(coupon.appliesTo);
  const hasProductRestriction = !!restriction.productIds?.length;
  const hasCollectionRestriction = !!restriction.collectionIds?.length;
  if (hasProductRestriction || hasCollectionRestriction) {
    const productsOk = !hasProductRestriction || ctx.cartProductIds.every((id) => restriction.productIds!.includes(id));
    const collectionsOk =
      !hasCollectionRestriction || ctx.cartCollectionIds.every((id) => restriction.collectionIds!.includes(id));
    if (!productsOk || !collectionsOk) return { ok: false, reason: "not_applicable" };
  }
  return { ok: true };
}

/** Discount in paise for a coupon already known to be valid (`validateCoupon` returned ok).
 * `kind: "fixed"`'s `value` column is itself an integer amount of paise (consistent with every
 * other money column in the schema); `kind: "percent"`'s `value` is a whole-number percentage.
 * Never exceeds the subtotal, and is capped by `maxDiscountPaise` when set. */
export function computeCouponDiscountPaise(coupon: CouponRow, subtotalPaise: Paise): Paise {
  let discount = coupon.kind === "percent" ? Math.round((subtotalPaise * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscountPaise != null) discount = Math.min(discount, coupon.maxDiscountPaise);
  discount = Math.max(0, Math.min(discount, subtotalPaise));
  return paise(discount);
}

/**
 * The automatic cross-pillar bundle discount (CLAUDE.md §7.2's 2026-09-10 amendment): when the
 * priced cart contains at least one Tea-pillar line and at least one Masala-pillar line, apply
 * `percent`% off the single cheapest qualifying unit in the cart. Deliberately the simpler of the
 * two options considered (a `max_discount_paise`-style cap, like `coupons`, was the other) — a
 * straight percent off one unit is easy for a shopper to verify by eye ("that's 10% off my
 * cheapest item") and needs no second settings key to reason about, at the cost of being a smaller
 * absolute discount on a large cart than a subtotal-percentage would give; revisit if the client
 * wants the bigger-basket incentive instead. Pure — no I/O, takes already-priced lines and the
 * settings-derived percent, so it's unit-testable with no database in the loop.
 */
function computeCrossPillarDiscountPaise(lines: PricingLine[], percent: number): Paise {
  if (percent <= 0 || lines.length === 0) return paise(0);

  const hasTea = lines.some((l) => TEA_COLLECTION_SLUGS.has(l.collectionSlug));
  const hasMasala = lines.some((l) => MASALA_COLLECTION_SLUGS.has(l.collectionSlug));
  if (!hasTea || !hasMasala) return paise(0);

  const cheapestUnitPaise = Math.min(...lines.map((l) => l.unitPricePaise));
  return paise(Math.round((cheapestUnitPaise * percent) / 100));
}

/**
 * The pricing engine. Re-reads every variant fresh from Postgres (via `deps`), clamps quantities
 * to real stock, prices only what's actually purchasable, evaluates an optional coupon against
 * every rule, and returns a fully server-computed breakdown plus a list of everything that had to
 * be corrected. Never trusts a caller-supplied price (CLAUDE.md §7.5).
 */
export async function computePricing(input: PricingInput, deps: PricingDeps): Promise<PricingResult> {
  const now = input.now ?? new Date();
  const normalized = normalizeLines(input.lines);
  const issues: PricingIssue[] = [];

  const [variantRows, freeGiftThresholdPaise] = await Promise.all([
    deps.getVariants(normalized.map((l) => l.variantId)),
    deps.getFreeGiftThresholdPaise(),
  ]);
  const byId = new Map(variantRows.map((v) => [v.variantId, v]));

  const lines: PricingLine[] = [];
  const regularNormalized = normalized.filter((l) => !l.isGift);
  const giftCandidate = normalized.find((l) => l.isGift);

  for (const { variantId, qty: requestedQty } of regularNormalized) {
    const v = byId.get(variantId);
    if (!v) {
      issues.push({ type: "variant_not_found", variantId });
      continue;
    }
    if (!v.inStock) {
      issues.push({ type: "out_of_stock", variantId, productName: v.productName });
      continue;
    }
    let qty = requestedQty;
    if (v.stockQty != null && requestedQty > v.stockQty) {
      issues.push({
        type: "insufficient_stock",
        variantId,
        productName: v.productName,
        requestedQty,
        availableQty: v.stockQty,
      });
      qty = v.stockQty;
    }
    if (qty <= 0) continue;
    lines.push({
      variantId: v.variantId,
      productId: v.productId,
      collectionId: v.collectionId,
      productName: v.productName,
      priority: v.priority,
      collectionSlug: v.collectionSlug,
      productSlug: v.productSlug,
      sku: v.sku,
      optionValue: v.optionValue,
      mrpPaise: v.mrpPaise,
      unitPricePaise: v.pricePaise,
      qty,
      requestedQty,
      lineTotalPaise: paise(v.pricePaise * qty),
      imageStorageKey: v.imageStorageKey,
      isGift: false,
    });
  }

  // The free-gift line, evaluated against the REST of the cart only (never itself, and never a
  // client-supplied flag alone — CLAUDE.md §7.5): one of the real, allowlisted gift SKUs, in
  // stock, from a pillar NOT already present in the paid cart (client rule, 2026-09-17 — buying
  // Blue Tea offers Red Tea/Spices/Black Tea as gifts, never another Blue Tea; unless every pillar is
  // already in the cart, see below), only once the paid
  // subtotal above already clears the real settings threshold.
  if (giftCandidate) {
    const { variantId, qty: requestedQty } = giftCandidate;
    const v = byId.get(variantId);
    const regularSubtotalSoFarPaise = sumPaise(lines.map((l) => l.lineTotalPaise));
    const paidPillars = new Set(lines.flatMap((l) => pillarsOf(l.collectionSlug, l.productSlug)));
    const giftPillar = v ? giftPillarOf(v) : null;
    if (!v) {
      issues.push({ type: "variant_not_found", variantId });
    } else if (!v.inStock) {
      issues.push({ type: "out_of_stock", variantId, productName: v.productName });
    } else if (giftPillar == null || (paidPillars.has(giftPillar) && paidPillars.size < GIFT_PILLAR_COUNT)) {
      // Either not one of the allowlisted gift SKUs at all, or it belongs to a pillar the shopper
      // is already buying (e.g. requesting the Blue Tea 20g gift while Blue Tea is in the cart) —
      // both are "not a valid gift for this cart" from the shopper's point of view. The exception
      // (client, 2026-09-20): once the cart already holds ALL the pillars there is nothing new to
      // offer, so any allowlisted gift is honoured rather than leaving the shopper with none.
      issues.push({ type: "gift_not_eligible", variantId });
    } else {
      if (freeGiftThresholdPaise == null || regularSubtotalSoFarPaise < freeGiftThresholdPaise) {
        issues.push({ type: "gift_threshold_not_met", variantId, thresholdPaise: freeGiftThresholdPaise ?? paise(0) });
      } else {
        lines.push({
          variantId: v.variantId,
          productId: v.productId,
          collectionId: v.collectionId,
          productName: v.productName,
          priority: v.priority,
          collectionSlug: v.collectionSlug,
          productSlug: v.productSlug,
          sku: v.sku,
          optionValue: v.optionValue,
          mrpPaise: v.mrpPaise,
          unitPricePaise: paise(0),
          qty: 1,
          requestedQty,
          lineTotalPaise: paise(0),
          imageStorageKey: v.imageStorageKey,
          isGift: true,
        });
      }
    }
  }

  const subtotalPaise = sumPaise(lines.map((l) => l.lineTotalPaise));
  const savingsPaise = sumPaise(lines.map((l) => paise((l.mrpPaise - l.unitPricePaise) * l.qty)));
  // Coupon/cross-pillar eligibility both read from paid lines only — a free gift can't be used to
  // unlock a discount (a Tea+Masala cross-pillar bonus, an `applies_to` coupon) it didn't actually
  // qualify the cart for.
  const paidLines = lines.filter((l) => !l.isGift);

  let discountPaise: Paise = paise(0);
  let couponCode: string | null = null;
  const requestedCode = input.couponCode?.trim();
  if (requestedCode) {
    const coupon = await deps.getCoupon(requestedCode);
    const hasEmail = !!input.email;
    const [priorOrderExists, userRedemptions] = await Promise.all([
      hasEmail ? deps.hasAnyOrderForEmail(input.email!) : Promise.resolve(false),
      hasEmail && coupon ? deps.countCouponRedemptionsByEmail(coupon.id, input.email!) : Promise.resolve(0),
    ]);
    const ctx: CouponContext = {
      subtotalPaise,
      now,
      priorOrderExists,
      totalRedemptions: coupon?.usedCount ?? 0,
      userRedemptions,
      hasEmail,
      cartProductIds: Array.from(new Set(paidLines.map((l) => l.productId))),
      cartCollectionIds: Array.from(new Set(paidLines.map((l) => l.collectionId))),
    };
    const verdict = validateCoupon(coupon, ctx);
    if (verdict.ok && coupon) {
      discountPaise = computeCouponDiscountPaise(coupon, subtotalPaise);
      couponCode = coupon.code;
    } else if (!verdict.ok) {
      issues.push({ type: "coupon_invalid", code: requestedCode.toUpperCase(), reason: verdict.reason });
    }
  }

  const [freeShippingThresholdPaise, standardShippingPaise, crossPillarPercent] = await Promise.all([
    deps.getFreeShippingThresholdPaise(),
    deps.getStandardShippingPaise(),
    deps.getCrossPillarBundleDiscountPercent(),
  ]);
  // Free-shipping eligibility is judged on the undiscounted subtotal — "spend ₹500" means cart
  // value, not the post-coupon amount — matching the cart drawer's progress bar, which has no
  // coupon applied yet when it's shown.
  const shippingPaise: Paise = subtotalPaise >= freeShippingThresholdPaise ? paise(0) : standardShippingPaise;
  const rupeesToFreeShippingPaise: Paise = paise(Math.max(0, freeShippingThresholdPaise - subtotalPaise));

  const crossPillarDiscountPaise = computeCrossPillarDiscountPaise(paidLines, crossPillarPercent);
  const crossPillarApplied = crossPillarDiscountPaise > 0;

  const totalPaise = paise(subtotalPaise - discountPaise - crossPillarDiscountPaise + shippingPaise);

  const requestedCouponRejected = !!requestedCode && couponCode === null;
  const anyStockIssue = issues.some((i) => i.type !== "coupon_invalid");
  const clean = !anyStockIssue && !requestedCouponRejected;

  return {
    lines,
    subtotalPaise,
    discountPaise,
    crossPillarDiscountPaise,
    crossPillarApplied,
    shippingPaise,
    totalPaise,
    savingsPaise,
    couponCode,
    freeShippingThresholdPaise,
    rupeesToFreeShippingPaise,
    freeGiftThresholdPaise,
    hasFreeGift: lines.some((l) => l.isGift),
    issues,
    clean,
  };
}
