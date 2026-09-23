/**
 * Operational script — creates (or resets) a REAL customer account for testing the storefront's
 * signed-in flows (account pages, order history, wishlist merge), the same pattern as
 * scripts/create-staff-user.ts but with role "customer" and no admin/staff privileges.
 *
 * Not seed data: scripts/seed.ts stays constrained (CLAUDE.md §7.6/§8) to never invent customers;
 * this creates one real, operator-provided (or generated-here, clearly test-labelled) account via
 * the Supabase Auth Admin API, with `email_confirm: true` so it can sign in immediately without an
 * email round-trip.
 *
 * Usage:
 *   pnpm create-customer-user --email=test.customer@dishumasala.com --password='...' --name="Test Customer"
 *   or via env vars: CUSTOMER_EMAIL / CUSTOMER_PASSWORD / CUSTOMER_NAME
 * All three are optional — omitted ones get a clearly-test default (a random password is printed).
 * Idempotent: re-running with the same email resets that account's password/name instead of
 * creating a duplicate.
 */
import { closeScriptDb, scriptDb, eq } from "../lib/db/script-client";
import { users } from "../lib/db/schema";
import { createSupabaseAdminClient } from "../lib/supabase/admin-core";
import { randomBytes } from "node:crypto";

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([a-zA-Z-]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function randomPassword(): string {
  return randomBytes(9).toString("base64url"); // 12 chars, well over the 8-char minimum
}

async function main() {
  const args = parseArgs();
  const email = (args.email ?? process.env.CUSTOMER_EMAIL ?? "test.customer@dishumasala.com").trim().toLowerCase();
  const password = args.password ?? process.env.CUSTOMER_PASSWORD ?? randomPassword();
  const name = (args.name ?? process.env.CUSTOMER_NAME ?? "Test Customer").trim();

  if (!email.includes("@")) throw new Error(`"${email}" doesn't look like a real email address.`);
  if (password.length < 8) throw new Error("--password (or CUSTOMER_PASSWORD) must be at least 8 characters.");

  const supabase = createSupabaseAdminClient();

  const { data: existingList, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Could not list Supabase users: ${listError.message}`);
  const existingAuthUser = existingList.users.find((u) => u.email?.toLowerCase() === email);

  let authUserId: string;
  if (existingAuthUser) {
    const { error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) throw new Error(`Could not update Supabase user: ${error.message}`);
    authUserId = existingAuthUser.id;
    console.log(`Updated existing Supabase auth user ${email}.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) throw new Error(`Could not create Supabase user: ${error?.message ?? "unknown error"}`);
    authUserId = data.user.id;
    console.log(`Created Supabase auth user ${email}.`);
  }

  // The on_auth_user_created trigger (migration 0008) has created (or already linked) the matching
  // public.users row, defaulted to role "customer" — nothing to change there, just sync the name and
  // mark the email verified so no confirmation step blocks sign-in (CLAUDE.md §12's follow-up entry:
  // enable_confirmations means an unverified account can't sign in at all).
  const now = new Date();
  const updated = await scriptDb
    .update(users)
    .set({ name, emailVerifiedAt: now, updatedAt: now, authUserId })
    .where(eq(users.email, email))
    .returning({ id: users.id, role: users.role });

  if (updated.length === 0) {
    throw new Error(
      `Supabase user ${email} exists but no public.users row was found for it. ` +
        "The on_auth_user_created trigger (migration 0008) may not be installed — run `pnpm db:migrate`.",
    );
  }

  console.log(`public.users row #${updated[0].id}, role "${updated[0].role}".`);
  console.log("\nTest customer account:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeScriptDb());
