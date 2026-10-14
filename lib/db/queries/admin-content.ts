import "server-only";

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "../index";
import type { ContentStatus } from "../schema/enums";
import { pages, posts } from "../schema";

export interface AdminPostRow {
  id: number;
  slug: string;
  kind: "blog" | "recipe";
  title: string;
  status: ContentStatus;
  publishedAt: Date | null;
  author: string | null;
}

export async function listAdminPosts(kind?: "blog" | "recipe"): Promise<AdminPostRow[]> {
  const where = kind ? eq(posts.kind, kind) : undefined;
  return db
    .select({ id: posts.id, slug: posts.slug, kind: posts.kind, title: posts.title, status: posts.status, publishedAt: posts.publishedAt, author: posts.author })
    .from(posts)
    .where(where)
    .orderBy(desc(posts.publishedAt), desc(posts.id));
}

export interface AdminPostDetail {
  id: number;
  slug: string;
  kind: "blog" | "recipe";
  title: string;
  excerpt: string | null;
  body: unknown;
  coverStorageKey: string | null;
  coverUrl: string | null;
  status: ContentStatus;
  author: string | null;
  publishedAt: Date | null;
  seoTitle: string | null;
  seoDescription: string | null;
  relatedProductIds: number[];
}

export async function getAdminPostById(id: number): Promise<AdminPostDetail | null> {
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!row) return null;
  const { publicUrl } = await import("@/lib/storage/storage");
  return { ...row, coverUrl: row.coverStorageKey ? publicUrl(row.coverStorageKey) : null };
}

export async function isPostSlugTaken(slug: string, excludeId?: number): Promise<boolean> {
  const conditions = [eq(posts.slug, slug)];
  if (excludeId != null) conditions.push(ne(posts.id, excludeId));
  const [row] = await db.select({ id: posts.id }).from(posts).where(and(...conditions)).limit(1);
  return !!row;
}

// -----------------------------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------------------------

export interface AdminPageRow {
  id: number;
  slug: string;
  title: string;
  status: ContentStatus;
  updatedAt: Date;
}

export async function listAdminPages(): Promise<AdminPageRow[]> {
  return db.select({ id: pages.id, slug: pages.slug, title: pages.title, status: pages.status, updatedAt: pages.updatedAt }).from(pages).orderBy(asc(pages.title));
}

export interface AdminPageDetail {
  id: number;
  slug: string;
  title: string;
  body: unknown;
  status: ContentStatus;
  updatedAt: Date;
}

export async function getAdminPageById(id: number): Promise<AdminPageDetail | null> {
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return row ?? null;
}

export async function isPageSlugTaken(slug: string, excludeId?: number): Promise<boolean> {
  const conditions = [eq(pages.slug, slug)];
  if (excludeId != null) conditions.push(ne(pages.id, excludeId));
  const [row] = await db.select({ id: pages.id }).from(pages).where(and(...conditions)).limit(1);
  return !!row;
}

export async function listProductsForRelatedPicker(): Promise<{ id: number; name: string }[]> {
  const { products } = await import("../schema");
  return db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name));
}
