import "server-only";

import { db } from "../index";
import { bulkEnquiries, contactMessages, newsletterSubs, phoneLeads, visitorEvents } from "../schema";

export interface UpsertPhoneLeadInput {
  phone: string;
  visitorId: string | null;
  sourcePath: string;
}

/** Called only from app/api/marketing/phone-lead/route.ts, which Zod-validates the phone and
 * requires `consent === true` before this ever runs — `consentAt` here is always "now", never
 * passed in, so a re-submission from the same number (e.g. a second device) re-affirms consent
 * with a fresh timestamp rather than silently keeping whatever the first one recorded. */
export async function upsertPhoneLead(input: UpsertPhoneLeadInput): Promise<void> {
  await db
    .insert(phoneLeads)
    .values({ phone: input.phone, consentAt: new Date(), visitorId: input.visitorId, sourcePath: input.sourcePath })
    .onConflictDoUpdate({
      target: phoneLeads.phone,
      set: { consentAt: new Date(), visitorId: input.visitorId, sourcePath: input.sourcePath },
    });
}

export interface RecordVisitorEventInput {
  visitorId: string;
  eventType: "page_view" | "product_view";
  path: string;
}

/** Called only from app/api/track/route.ts. No dedup/throttling here — a handful of duplicate rows
 * from a fast back-and-forth click is cheap and harmless for this table's purpose (a rough
 * "what did this visitor look at" timeline for messaging, not billing-grade analytics). */
export async function recordVisitorEvent(input: RecordVisitorEventInput): Promise<void> {
  await db.insert(visitorEvents).values(input);
}

export interface InsertBulkEnquiryInput {
  enquiryType: string;
  fullName: string;
  company: string | null;
  email: string;
  phone: string;
  country: string;
  website: string | null;
  requirement: string;
  sourcePath: string | null;
}

/** Called only from app/api/marketing/bulk-enquiry/route.ts, which Zod-validates every field
 * first. No upsert/dedup — unlike `upsertPhoneLead`, the same company enquiring twice (a follow-up,
 * a second occasion) is two real, separate things staff need to see, not one row to overwrite. */
export async function insertBulkEnquiry(input: InsertBulkEnquiryInput): Promise<void> {
  await db.insert(bulkEnquiries).values(input);
}

export interface InsertContactMessageInput {
  name: string;
  email: string;
  phone: string | null;
  message: string;
  sourcePath: string | null;
}

/** Called only from app/api/marketing/contact/route.ts, which Zod-validates every field first. */
export async function insertContactMessage(input: InsertContactMessageInput): Promise<void> {
  await db.insert(contactMessages).values(input);
}

/** Newsletter sign-up from the footer box — idempotent: signing up twice keeps the one row. */
export async function subscribeNewsletter(email: string, source: string | null): Promise<void> {
  await db.insert(newsletterSubs).values({ email: email.trim().toLowerCase(), source }).onConflictDoNothing({ target: newsletterSubs.email });
}
