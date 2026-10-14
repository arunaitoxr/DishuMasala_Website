import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { bulkEnquiries, contactMessages, newsletterSubs } from "../schema";

/**
 * What customers send in through the site — contact-form messages, corporate/bulk gifting enquiries
 * and newsletter sign-ups. These were stored but had no admin view at all (client request 2026-10-14:
 * every admin area must be usable), so staff never saw them.
 */
export const INBOX_PAGE_SIZE = 25;

export interface InboxMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  sourcePath: string | null;
  createdAt: Date;
}

export interface InboxEnquiry {
  id: number;
  enquiryType: string;
  fullName: string;
  company: string | null;
  email: string;
  phone: string;
  country: string;
  website: string | null;
  requirement: string;
  status: string;
  createdAt: Date;
}

export interface InboxSubscriber {
  id: number;
  email: string;
  source: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

const offset = (page: number) => (Math.max(1, page) - 1) * INBOX_PAGE_SIZE;

export async function listContactMessages(page: number): Promise<{ rows: InboxMessage[]; total: number }> {
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(contactMessages).orderBy(sql`case when ${contactMessages.status} = 'new' then 0 else 1 end`, desc(contactMessages.createdAt)).limit(INBOX_PAGE_SIZE).offset(offset(page)),
    db.select({ n: sql<number>`count(*)` }).from(contactMessages),
  ]);
  return { rows, total: Number(n) };
}

export async function listBulkEnquiries(page: number): Promise<{ rows: InboxEnquiry[]; total: number }> {
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: bulkEnquiries.id,
        enquiryType: bulkEnquiries.enquiryType,
        fullName: bulkEnquiries.fullName,
        company: bulkEnquiries.company,
        email: bulkEnquiries.email,
        phone: bulkEnquiries.phone,
        country: bulkEnquiries.country,
        website: bulkEnquiries.website,
        requirement: bulkEnquiries.requirement,
        status: bulkEnquiries.status,
        createdAt: bulkEnquiries.createdAt,
      })
      .from(bulkEnquiries)
      .orderBy(sql`case when ${bulkEnquiries.status} = 'new' then 0 else 1 end`, desc(bulkEnquiries.createdAt))
      .limit(INBOX_PAGE_SIZE)
      .offset(offset(page)),
    db.select({ n: sql<number>`count(*)` }).from(bulkEnquiries),
  ]);
  return { rows, total: Number(n) };
}

export async function listNewsletterSubscribers(page: number): Promise<{ rows: InboxSubscriber[]; total: number }> {
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(newsletterSubs).orderBy(desc(newsletterSubs.createdAt)).limit(INBOX_PAGE_SIZE).offset(offset(page)),
    db.select({ n: sql<number>`count(*)` }).from(newsletterSubs),
  ]);
  return { rows, total: Number(n) };
}

/** Unhandled messages + enquiries — the sidebar badge. */
export async function countNewInboxItems(): Promise<{ messages: number; enquiries: number }> {
  const [[m], [e]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(contactMessages).where(eq(contactMessages.status, "new")),
    db.select({ n: sql<number>`count(*)` }).from(bulkEnquiries).where(eq(bulkEnquiries.status, "new")),
  ]);
  return { messages: Number(m?.n ?? 0), enquiries: Number(e?.n ?? 0) };
}
