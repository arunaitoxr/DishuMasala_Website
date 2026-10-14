import "server-only";

/**
 * Customer-record writes for the admin (PROMPTS.md Phase 8 item 5; client request 2026-10-13: full
 * CRUD). Login credentials stay with Supabase Auth — the action layer changes the auth email or
 * deletes the auth user there; nothing here can set a password or sign in as a customer.
 * Every function is limited to `role = 'customer'` rows: staff and admin accounts aren't managed from
 * the Customers page.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../index";
import { users } from "../schema";

export interface CustomerContactInput {
  name: string;
  phone: string | null;
  email: string;
}

export async function isEmailTakenByOtherUser(email: string, excludeId?: number): Promise<boolean> {
  const conditions = [sql`lower(${users.email}) = lower(${email})`];
  if (excludeId != null) conditions.push(ne(users.id, excludeId));
  const [row] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  return !!row;
}

export async function updateCustomerDb(id: number, input: CustomerContactInput): Promise<void> {
  await db
    .update(users)
    .set({ name: input.name, phone: input.phone, email: input.email.toLowerCase(), updatedAt: new Date() })
    .where(and(eq(users.id, id), eq(users.role, "customer")));
}

/** After Supabase created the auth user, the `on_auth_user_created` trigger has made (or linked) the
 * `public.users` row; fill in the name/phone and mark the email verified (staff created it). */
export async function finishCustomerCreateDb(email: string, authUserId: string, input: { name: string; phone: string | null }): Promise<number | null> {
  const now = new Date();
  const [row] = await db
    .update(users)
    .set({ name: input.name, phone: input.phone, authUserId, emailVerifiedAt: now, updatedAt: now })
    .where(and(sql`lower(${users.email}) = lower(${email})`, eq(users.role, "customer")))
    .returning({ id: users.id });
  return row?.id ?? null;
}

/** Deletes the customer row. Addresses, wishlist, cart and coupon redemptions go with it; orders and
 * reviews stay (their `user_id` is set to null) — order history is never deleted with an account. */
export async function deleteCustomerDb(id: number): Promise<void> {
  await db.delete(users).where(and(eq(users.id, id), eq(users.role, "customer")));
}
