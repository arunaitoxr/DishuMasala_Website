"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { deleteInboxItemDb, setInboxStatusDb, type InboxKind } from "@/lib/db/mutations/admin-inbox";

export type AdminResult = { ok: true; message: string } | { ok: false; error: string };

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  return { ok: true as const, user: session.user };
}

const ENTITY: Record<InboxKind, string> = { message: "contact_message", enquiry: "bulk_enquiry", newsletter: "newsletter_sub", lead: "phone_lead" };

const statusSchema = z.object({ kind: z.enum(["message", "enquiry"]), id: z.number().int().positive(), status: z.enum(["new", "handled"]) });

export async function setInboxStatusAction(input: z.infer<typeof statusSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const found = await setInboxStatusDb(parsed.data.kind, parsed.data.id, parsed.data.status);
  if (!found) return { ok: false, error: "Not found." };
  await writeAuditLog({ actorUserId: auth.user.id, action: `${ENTITY[parsed.data.kind]}.status`, entity: ENTITY[parsed.data.kind], entityId: parsed.data.id, diff: { status: parsed.data.status } });
  revalidatePath("/admin/inbox");
  revalidatePath("/admin", "layout");
  return { ok: true, message: parsed.data.status === "handled" ? "Marked as handled." : "Marked as new." };
}

/** Deletes a message, enquiry, newsletter sign-up or phone lead (typed confirmation: "delete"). */
export async function deleteInboxItemAction(kind: InboxKind, id: number, confirm: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  if (!["message", "enquiry", "newsletter", "lead"].includes(kind)) return { ok: false, error: "Invalid input." };
  if (confirm.trim().toLowerCase() !== "delete") return { ok: false, error: "Type delete to confirm." };
  const found = await deleteInboxItemDb(kind, id);
  if (!found) return { ok: false, error: "Not found." };
  await writeAuditLog({ actorUserId: auth.user.id, action: `${ENTITY[kind]}.delete`, entity: ENTITY[kind], entityId: id, diff: {} });
  revalidatePath(kind === "lead" ? "/admin/leads" : "/admin/inbox");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Deleted." };
}
