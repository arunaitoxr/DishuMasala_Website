import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../index";
import { coupons } from "../schema";

export interface CouponInput {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minSpendPaise: number | null;
  maxDiscountPaise: number | null;
  firstOrderOnly: boolean;
  usageLimit: number | null;
  perUserLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  appliesTo: { productIds?: number[]; collectionIds?: number[] } | null;
}

export async function createCouponDb(input: CouponInput): Promise<number> {
  const [row] = await db.insert(coupons).values({ ...input, code: input.code.toUpperCase() }).returning({ id: coupons.id });
  return row.id;
}

export async function updateCouponDb(id: number, input: CouponInput): Promise<void> {
  await db.update(coupons).set({ ...input, code: input.code.toUpperCase() }).where(eq(coupons.id, id));
}

export async function deleteCouponDb(id: number): Promise<void> {
  await db.delete(coupons).where(eq(coupons.id, id));
}
