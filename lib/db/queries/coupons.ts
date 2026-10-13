import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { coupons, orders } from "../schema";

export interface CouponRow {
  id: number;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minSpendPaise: number | null;
  maxDiscountPaise: number | null;
  firstOrderOnly: boolean;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  appliesTo: unknown;
}

/** Coupon codes are matched case-insensitively (WELCOME5 == welcome5) but stored as seeded. */
export async function getCouponByCode(code: string): Promise<CouponRow | null> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.trim().toUpperCase()))
    .limit(1);
  return row ?? null;
}

/**
 * Coupon usage is counted from PAID orders only (client decision, 2026-10-13). An order row is
 * inserted as `pending` the moment checkout commits — before Razorpay confirms anything — and an
 * abandoned or failed payment never becomes a real order. Counting those used to burn a coupon's
 * `usage_limit` on attempts that never paid, and made a shopper whose first payment failed
 * ineligible for WELCOME5 on the retry. Emails are compared case-insensitively.
 */

/** How many paid orders this email has placed with this coupon — the per-customer limit. Works for
 * guests and signed-in shoppers alike, since every order carries its email and coupon code. */
export async function countPaidCouponUsesByEmail(couponId: number, email: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .innerJoin(coupons, eq(coupons.code, orders.couponCode))
    .where(and(eq(coupons.id, couponId), sql`lower(${orders.email}) = lower(${email})`, eq(orders.paymentStatus, "paid")));
  return Number(row?.n ?? 0);
}

/** Whether this email already has a paid order — the "first order" test for `firstOrderOnly`
 * coupons like WELCOME5. */
export async function hasPaidOrderForEmail(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(sql`lower(${orders.email}) = lower(${email})`, eq(orders.paymentStatus, "paid")))
    .limit(1);
  return row != null;
}
