import "server-only";

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "../index";
import { coupons, orders } from "../schema";

export interface AdminCouponRow {
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

export async function listAdminCoupons(): Promise<AdminCouponRow[]> {
  return db.select().from(coupons).orderBy(desc(coupons.active), asc(coupons.code));
}

export async function getAdminCouponById(id: number): Promise<AdminCouponRow | null> {
  const [row] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return row ?? null;
}

export async function isCouponCodeTaken(code: string, excludeId?: number): Promise<boolean> {
  const conditions = [eq(coupons.code, code.toUpperCase())];
  if (excludeId != null) conditions.push(ne(coupons.id, excludeId));
  const [row] = await db.select({ id: coupons.id }).from(coupons).where(and(...conditions)).limit(1);
  return !!row;
}

export interface CouponRedemptionRow {
  id: number;
  orderNumber: string;
  orderEmail: string;
  orderTotalPaise: number;
  createdAt: Date;
}

/** Every paid order that used this coupon — guests included (their orders carry the code too), so
 * the history matches the coupon's usage count. */
export async function getCouponRedemptions(couponId: number): Promise<CouponRedemptionRow[]> {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderEmail: orders.email,
      orderTotalPaise: orders.totalPaise,
      createdAt: orders.placedAt,
    })
    .from(orders)
    .innerJoin(coupons, eq(coupons.code, orders.couponCode))
    .where(and(eq(coupons.id, couponId), eq(orders.paymentStatus, "paid")))
    .orderBy(desc(orders.placedAt));
}

export async function listProductsAndCollectionsForPicker() {
  const { products, collections } = await import("../schema");
  const [productRows, collectionRows] = await Promise.all([
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
    db.select({ id: collections.id, title: collections.title }).from(collections).orderBy(asc(collections.priority)),
  ]);
  return { products: productRows, collections: collectionRows };
}

/** Whether any order (paid or not) was placed with this code. Usage limits and the coupon's order
 * list match orders by the code text, so a code that has been used can't be renamed. */
export async function isCouponCodeOnOrders(code: string): Promise<boolean> {
  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.couponCode, code.toUpperCase())).limit(1);
  return !!row;
}
