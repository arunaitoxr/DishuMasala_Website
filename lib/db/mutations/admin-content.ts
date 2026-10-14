import "server-only";

import { eq } from "drizzle-orm";
import { deleteObject, listImageFamily } from "@/lib/storage/storage";
import { db } from "../index";
import { pages, posts } from "../schema";
import type { TiptapDoc } from "@/lib/content/tiptap-schema";

export interface PostInput {
  slug: string;
  kind: "blog" | "recipe";
  title: string;
  excerpt: string | null;
  body: TiptapDoc;
  coverStorageKey: string | null;
  coverAlt: string | null;
  author: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  relatedProductIds: number[];
}

export async function createPostDb(input: PostInput): Promise<number> {
  const [row] = await db.insert(posts).values({ ...input, status: "draft", body: input.body }).returning({ id: posts.id });
  return row.id;
}

export async function updatePostDb(id: number, input: PostInput): Promise<void> {
  await db.update(posts).set({ ...input, body: input.body }).where(eq(posts.id, id));
}

export type PublishResult = { ok: true } | { ok: false; error: string };

/** Sets status "published" and, if the caller didn't schedule a future `publishedAt`, stamps it
 * with now(). A future `publishedAt` alongside status "published" is how scheduling works — the
 * storefront query (lib/db/queries/posts.ts) only surfaces rows where `published_at <= now()`. */
export async function publishPostDb(id: number, publishedAt: Date | null): Promise<PublishResult> {
  const [row] = await db.select({ body: posts.body }).from(posts).where(eq(posts.id, id)).limit(1);
  if (!row) return { ok: false, error: "Post not found." };
  await db.update(posts).set({ status: "published", publishedAt: publishedAt ?? new Date() }).where(eq(posts.id, id));
  return { ok: true };
}

export async function unpublishPostDb(id: number): Promise<void> {
  await db.update(posts).set({ status: "draft" }).where(eq(posts.id, id));
}

// -----------------------------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------------------------

export interface PageInput {
  slug: string;
  title: string;
  body: TiptapDoc;
}

export async function createPageDb(input: PageInput): Promise<number> {
  const [row] = await db.insert(pages).values({ ...input, body: input.body, status: "draft", updatedAt: new Date() }).returning({ id: pages.id });
  return row.id;
}

export async function updatePageDb(id: number, input: PageInput): Promise<void> {
  await db.update(pages).set({ ...input, body: input.body, updatedAt: new Date() }).where(eq(pages.id, id));
}

export async function publishPageDb(id: number): Promise<void> {
  await db.update(pages).set({ status: "published", updatedAt: new Date() }).where(eq(pages.id, id));
}

export async function unpublishPageDb(id: number): Promise<void> {
  await db.update(pages).set({ status: "draft", updatedAt: new Date() }).where(eq(pages.id, id));
}

async function deleteImageFiles(storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  const family = await listImageFamily(storageKey).catch(() => [storageKey]);
  for (const key of family) await deleteObject(key).catch(() => {});
}

/** Deletes a post for good, with its cover image files. Returns what the caller needs to refresh. */
export async function deletePostDb(id: number): Promise<{ slug: string; kind: "blog" | "recipe" } | null> {
  const [row] = await db.delete(posts).where(eq(posts.id, id)).returning({ slug: posts.slug, kind: posts.kind, coverStorageKey: posts.coverStorageKey });
  if (!row) return null;
  await deleteImageFiles(row.coverStorageKey);
  return { slug: row.slug, kind: row.kind };
}

/** When a cover is replaced or removed, its old files go (posts don't share cover files). */
export async function deleteReplacedCoverFiles(storageKey: string | null): Promise<void> {
  await deleteImageFiles(storageKey);
}

export async function deletePageDb(id: number): Promise<{ slug: string } | null> {
  const [row] = await db.delete(pages).where(eq(pages.id, id)).returning({ slug: pages.slug });
  return row ?? null;
}
