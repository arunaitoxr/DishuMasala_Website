"use server";

/**
 * Coupon admin mutations (PROMPTS.md Phase 8 item 3). Every field offered here maps 1:1 to a rule
 * `lib/commerce/pricing.ts`'s `validateCoupon`/`computeCouponDiscountPaise` actually enforces at
 * checkout — kind, value, minSpendPaise, maxDiscountPaise, firstOrderOnly, usageLimit,
 * perUserLimit, startsAt/endsAt, active, appliesTo (productIds/collectionIds). Nothing is offered
 * here that pricing.ts doesn't genuinely check ("A rule that cannot be enforced must not be
 * offerable in the UI" — PROMPTS.md).
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { fromISTDateTimeLocal } from "@/lib/dates";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { createCouponDb, deleteCouponDb, updateCouponDb, type CouponInput } from "@/lib/db/mutations/admin-coupons";
import { isCouponCodeTaken, getAdminCouponById } from "@/lib/db/queries/admin-coupons";

export type AdminResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) {
    return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  }
  return { ok: true as const, user: session.user };
}

const couponSchema = z
  .object({
    code: z.string().trim().min(2, "Code is required").max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, hyphens and underscores only"),
    kind: z.enum(["percent", "fixed"]),
    // Percent: a whole number 1–100. Fixed: rupees (paise allowed), stored as paise like every other
    // money column — it used to be stored as the bare rupee number, so "₹100 off" took ₹1 off.
    value: z.coerce.number().positive("Enter a discount greater than 0"),
    minSpendRupees: z.coerce.number().min(0, "Minimum spend can't be negative").nullable(),
    // The "upper limit": however large the percentage, the discount never exceeds this.
    maxDiscountRupees: z.coerce.number().positive("The maximum discount must be more than ₹0").nullable(),
    firstOrderOnly: z.boolean(),
    usageLimit: z.coerce.number().int().positive().nullable(),
    perUserLimit: z.coerce.number().int().positive().nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    active: z.boolean(),
    productIds: z.array(z.number().int().positive()),
    collectionIds: z.array(z.number().int().positive()),
  })
  .refine((v) => v.kind !== "percent" || (Number.isInteger(v.value) && v.value <= 100), {
    message: "A percent coupon must be a whole number from 1 to 100",
    path: ["value"],
  })
  .refine((v) => v.kind !== "fixed" || Math.abs(v.value * 100 - Math.round(v.value * 100)) < 1e-6, {
    message: "Enter the amount in rupees, at most two decimal places",
    path: ["value"],
  })
  .refine((v) => !v.startsAt || fromISTDateTimeLocal(v.startsAt) != null, { message: "Start time isn't a valid date", path: ["startsAt"] })
  .refine((v) => !v.endsAt || fromISTDateTimeLocal(v.endsAt) != null, { message: "End time isn't a valid date", path: ["endsAt"] })
  .refine(
    (v) => {
      const start = fromISTDateTimeLocal(v.startsAt);
      const end = fromISTDateTimeLocal(v.endsAt);
      return !start || !end || end > start;
    },
    { message: "The end time must be after the start time", path: ["endsAt"] },
  );

function toDbInput(parsed: z.infer<typeof couponSchema>): CouponInput {
  const appliesTo =
    parsed.productIds.length || parsed.collectionIds.length
      ? { productIds: parsed.productIds.length ? parsed.productIds : undefined, collectionIds: parsed.collectionIds.length ? parsed.collectionIds : undefined }
      : null;
  return {
    code: parsed.code,
    kind: parsed.kind,
    value: parsed.kind === "fixed" ? Math.round(parsed.value * 100) : parsed.value,
    minSpendPaise: parsed.minSpendRupees != null ? Math.round(parsed.minSpendRupees * 100) : null,
    // A cap only means something on a percentage; a fixed amount is already its own ceiling.
    maxDiscountPaise: parsed.kind === "percent" && parsed.maxDiscountRupees != null ? Math.round(parsed.maxDiscountRupees * 100) : null,
    firstOrderOnly: parsed.firstOrderOnly,
    usageLimit: parsed.usageLimit,
    perUserLimit: parsed.perUserLimit,
    // Staff type these in IST; read them as IST whatever timezone the server runs in.
    startsAt: fromISTDateTimeLocal(parsed.startsAt),
    endsAt: fromISTDateTimeLocal(parsed.endsAt),
    active: parsed.active,
    appliesTo,
  };
}

export async function checkCouponCodeAvailableAction(code: string, excludeId?: number): Promise<{ available: boolean }> {
  const auth = await requireStaff();
  if (!auth.ok) return { available: false };
  return { available: !(await isCouponCodeTaken(code, excludeId)) };
}

export async function createCouponAction(input: z.infer<typeof couponSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (await isCouponCodeTaken(parsed.data.code)) {
    return { ok: false, error: `The code "${parsed.data.code.toUpperCase()}" is already in use.` };
  }

  const dbInput = toDbInput(parsed.data);
  const id = await createCouponDb(dbInput);
  await writeAuditLog({ actorUserId: auth.user.id, action: "coupon.create", entity: "coupon", entityId: id, diff: { code: dbInput.code, kind: dbInput.kind, value: dbInput.value } });
  revalidatePath("/admin/coupons");
  return { ok: true, message: "Coupon created.", data: { id } };
}

export async function updateCouponAction(id: number, input: z.infer<typeof couponSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await getAdminCouponById(id);
  if (!existing) return { ok: false, error: "Coupon not found." };

  if (await isCouponCodeTaken(parsed.data.code, id)) {
    return { ok: false, error: `The code "${parsed.data.code.toUpperCase()}" is already in use.` };
  }

  const dbInput = toDbInput(parsed.data);
  await updateCouponDb(id, dbInput);
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "coupon.update",
    entity: "coupon",
    entityId: id,
    diff: { active: existing.active === dbInput.active ? undefined : { from: existing.active, to: dbInput.active }, value: dbInput.value },
  });
  revalidatePath("/admin/coupons");
  return { ok: true, message: "Coupon saved." };
}

/** Deletes a coupon outright, behind a typed confirmation of its code (CLAUDE.md §9). Past orders keep
 * the code they were placed with — `orders.coupon_code` is a snapshot, not a reference — so order
 * history is untouched; the coupon's own redemption rows go with it. */
export async function deleteCouponAction(id: number, confirmCode: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const existing = await getAdminCouponById(id);
  if (!existing) return { ok: false, error: "Coupon not found." };
  if (confirmCode.trim().toUpperCase() !== existing.code) {
    return { ok: false, error: `Type the code ${existing.code} exactly to confirm.` };
  }

  await deleteCouponDb(id);
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "coupon.delete",
    entity: "coupon",
    entityId: id,
    diff: { code: existing.code, kind: existing.kind, value: existing.value, usedCount: existing.usedCount },
  });
  revalidatePath("/admin/coupons");
  return { ok: true, message: `Coupon ${existing.code} deleted.` };
}
