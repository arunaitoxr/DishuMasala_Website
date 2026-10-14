import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../index";
import { bulkEnquiries, contactMessages, newsletterSubs, phoneLeads } from "../schema";

export type InboxKind = "message" | "enquiry" | "newsletter" | "lead";
export type InboxStatus = "new" | "handled";

/** Marks a contact message or a bulk enquiry new / handled. */
export async function setInboxStatusDb(kind: "message" | "enquiry", id: number, status: InboxStatus): Promise<boolean> {
  const table = kind === "message" ? contactMessages : bulkEnquiries;
  const rows = await db.update(table).set({ status }).where(eq(table.id, id)).returning({ id: table.id });
  return rows.length > 0;
}

/** Deletes one inbox item (spam, a test, an unsubscribe request). Returns who it was from (email or
 * phone) for the audit log, or null when there was no such item. */
export async function deleteInboxItemDb(kind: InboxKind, id: number): Promise<{ contact: string } | null> {
  if (kind === "lead") {
    const [row] = await db.delete(phoneLeads).where(eq(phoneLeads.id, id)).returning({ contact: phoneLeads.phone });
    return row ?? null;
  }
  const table = kind === "message" ? contactMessages : kind === "enquiry" ? bulkEnquiries : newsletterSubs;
  const [row] = await db.delete(table).where(eq(table.id, id)).returning({ contact: table.email });
  return row ?? null;
}
