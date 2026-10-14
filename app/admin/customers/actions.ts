"use server";

/**
 * Customer admin actions (PROMPTS.md Phase 8 item 5; client request 2026-10-13: full CRUD).
 * Add a customer, edit name / phone / email, manage their saved addresses, delete the account.
 * No password is ever set or seen here and there is no "sign in as" — a customer created by staff
 * sets their own password through "Forgot password". Only `customer` accounts are managed here.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { addressSchema } from "@/lib/commerce/address";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteCustomerDb, finishCustomerCreateDb, isEmailTakenByOtherUser, updateCustomerDb } from "@/lib/db/mutations/admin-customers";
import { createAddress, deleteAddress, setDefaultAddress, updateAddress } from "@/lib/db/mutations/addresses";
import { getAdminCustomerById } from "@/lib/db/queries/admin-customers";

export type AdminResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  return { ok: true as const, user: session.user };
}

/** The customer, or an error when the id isn't a customer account (staff/admin are managed elsewhere). */
async function loadCustomer(id: number) {
  const customer = await getAdminCustomerById(id);
  if (!customer) return { ok: false as const, error: "Customer not found." };
  if (customer.role !== "customer") return { ok: false as const, error: "Staff and admin accounts can't be changed from Customers." };
  return { ok: true as const, customer };
}

/** "+91 98765 43210", "098765 43210", "9876543210" → "9876543210"; empty → null; anything else → "invalid". */
function normalizeMobile(value: string | null | undefined): string | null | "invalid" {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : "invalid";
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.email("Enter a valid email address").transform((e) => e.trim().toLowerCase()),
  phone: z.string().trim().max(20).nullable(),
});

function refresh(id?: number) {
  revalidatePath("/admin/customers");
  if (id) revalidatePath(`/admin/customers/${id}`);
}

export async function createCustomerAction(input: z.infer<typeof contactSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const phone = normalizeMobile(parsed.data.phone);
  if (phone === "invalid") return { ok: false, error: "Enter a valid 10-digit Indian mobile number (or leave it empty)." };
  if (await isEmailTakenByOtherUser(parsed.data.email)) return { ok: false, error: "An account with that email already exists." };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
    user_metadata: { name: parsed.data.name },
  });
  if (error || !data.user) return { ok: false, error: `Couldn't create the account: ${error?.message ?? "unknown error"}` };

  // If the app-side record can't be finished, take the login back out — otherwise a retry fails with
  // "already registered" and the person has a login with no customer record.
  const id = await finishCustomerCreateDb(parsed.data.email, data.user.id, { name: parsed.data.name, phone }).catch(() => null);
  if (id == null) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { ok: false, error: "The customer couldn't be saved — nothing was created. Please try again." };
  }

  await writeAuditLog({ actorUserId: auth.user.id, action: "customer.create", entity: "user", entityId: id, diff: { email: parsed.data.email } });
  refresh(id);
  return { ok: true, message: "Customer added. They can set a password with “Forgot password” on the sign-in page.", data: { id } };
}

export async function updateCustomerAction(id: number, input: z.infer<typeof contactSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const phone = normalizeMobile(parsed.data.phone);
  if (phone === "invalid") return { ok: false, error: "Enter a valid 10-digit Indian mobile number (or leave it empty)." };
  const loaded = await loadCustomer(id);
  if (!loaded.ok) return loaded;
  const { customer } = loaded;

  const emailChanged = parsed.data.email !== customer.email.toLowerCase();
  if (emailChanged) {
    if (await isEmailTakenByOtherUser(parsed.data.email, id)) return { ok: false, error: "Another account already uses that email." };
    // The sign-in email lives in Supabase Auth — change it there first, so the two never disagree.
    if (customer.authUserId) {
      const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(customer.authUserId, { email: parsed.data.email, email_confirm: true });
      if (error) return { ok: false, error: `Couldn't change the sign-in email: ${error.message}` };
    }
  }

  await updateCustomerDb(id, { name: parsed.data.name, phone, email: parsed.data.email });
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "customer.update",
    entity: "user",
    entityId: id,
    diff: {
      name: customer.name === parsed.data.name ? undefined : { from: customer.name, to: parsed.data.name },
      phone: customer.phone === phone ? undefined : { from: customer.phone, to: phone },
      email: emailChanged ? { from: customer.email, to: parsed.data.email } : undefined,
    },
  });
  refresh(id);
  return { ok: true, message: emailChanged ? "Saved — they now sign in with the new email." : "Customer details saved." };
}

/** Deletes the account (typed confirmation of the email). Orders and reviews are kept. */
export async function deleteCustomerAction(id: number, confirmEmail: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const loaded = await loadCustomer(id);
  if (!loaded.ok) return loaded;
  const { customer } = loaded;
  if (confirmEmail.trim().toLowerCase() !== customer.email.toLowerCase()) return { ok: false, error: `Type ${customer.email} exactly to confirm.` };

  if (customer.authUserId) {
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(customer.authUserId);
    // Already gone from Supabase is fine — carry on and remove the customer record.
    if (error && !/not.?found/i.test(error.message)) return { ok: false, error: `Couldn't delete the login: ${error.message}` };
  }
  await deleteCustomerDb(id);
  await writeAuditLog({ actorUserId: auth.user.id, action: "customer.delete", entity: "user", entityId: id, diff: { email: customer.email, name: customer.name } });
  refresh();
  return { ok: true, message: "Customer deleted. Their past orders are kept." };
}

// -------------------------------------------------------------------------------------------
// Addresses
// -------------------------------------------------------------------------------------------

const addressInput = addressSchema.extend({
  label: z.string().trim().max(40).nullable(),
  isDefault: z.boolean(),
});

export async function saveCustomerAddressAction(customerId: number, addressId: number | null, input: z.infer<typeof addressInput>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const loaded = await loadCustomer(customerId);
  if (!loaded.ok) return loaded;
  const phone = normalizeMobile(input.phone);
  const parsed = addressInput.safeParse({ ...input, phone: phone === "invalid" || phone == null ? input.phone : phone, line2: input.line2 || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid address." };

  const values = { ...parsed.data, label: parsed.data.label || null };
  const result = addressId == null ? await createAddress(customerId, values) : await updateAddress(addressId, customerId, values);
  if (!result.ok) return { ok: false, error: "Address not found." };
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: addressId == null ? "customer.address_create" : "customer.address_update",
    entity: "user",
    entityId: customerId,
    diff: { addressId: result.addressId, city: parsed.data.city, pincode: parsed.data.pincode },
  });
  refresh(customerId);
  return { ok: true, message: addressId == null ? "Address added." : "Address saved." };
}

export async function deleteCustomerAddressAction(customerId: number, addressId: number, confirm: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  if (confirm.trim().toLowerCase() !== "delete") return { ok: false, error: "Type delete to confirm." };
  const loaded = await loadCustomer(customerId);
  if (!loaded.ok) return loaded;
  const result = await deleteAddress(addressId, customerId);
  if (!result.ok) return { ok: false, error: "Address not found." };
  await writeAuditLog({ actorUserId: auth.user.id, action: "customer.address_delete", entity: "user", entityId: customerId, diff: { addressId } });
  refresh(customerId);
  return { ok: true, message: "Address deleted." };
}

export async function setDefaultCustomerAddressAction(customerId: number, addressId: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const loaded = await loadCustomer(customerId);
  if (!loaded.ok) return loaded;
  const result = await setDefaultAddress(addressId, customerId);
  if (!result.ok) return { ok: false, error: "Address not found." };
  await writeAuditLog({ actorUserId: auth.user.id, action: "customer.address_default", entity: "user", entityId: customerId, diff: { addressId } });
  refresh(customerId);
  return { ok: true, message: "Default address set." };
}
