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

/** Deletes one inbox item (spam, a test, an unsubscribe request). */
export async function deleteInboxItemDb(kind: InboxKind, id: number): Promise<boolean> {
  const table = kind === "message" ? contactMessages : kind === "enquiry" ? bulkEnquiries : kind === "newsletter" ? newsletterSubs : phoneLeads;
  const rows = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  return rows.length > 0;
}
