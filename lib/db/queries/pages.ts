import "server-only";

import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../index";
import { pages } from "../schema";
import { parseTiptapDoc } from "@/lib/content/tiptap-schema";

export interface PageDetail {
  id: number;
  slug: string;
  title: string;
  body: ReturnType<typeof parseTiptapDoc>;
  updatedAt: Date;
}

async function fetchPublishedPageBySlug(slug: string): Promise<PageDetail | null> {
  const [row] = await db.select().from(pages).where(and(eq(pages.slug, slug), eq(pages.status, "published"))).limit(1);
  if (!row) return null;
  return { id: row.id, slug: row.slug, title: row.title, body: parseTiptapDoc(row.body), updatedAt: row.updatedAt };
}

export async function getPublishedPageBySlug(slug: string): Promise<PageDetail | null> {
  return unstable_cache(() => fetchPublishedPageBySlug(slug), ["published-page", slug], { tags: ["pages", `page:${slug}`] })();
}

/** Slugs of every published page, for the sitemap. Uncached: the sitemap itself revalidates hourly. */
export async function getPublishedPageSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return db.select({ slug: pages.slug, updatedAt: pages.updatedAt }).from(pages).where(eq(pages.status, "published"));
}
