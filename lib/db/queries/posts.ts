import "server-only";

import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../index";
import { posts, products, productImages } from "../schema";
import { parseTiptapDoc } from "@/lib/content/tiptap-schema";

export interface PostSummary {
  id: number;
  slug: string;
  kind: "blog" | "recipe";
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  author: string | null;
  publishedAt: Date;
}

/** Published-and-due posts only: `status = 'published'` AND `published_at <= now()` — a future
 * `published_at` is exactly PROMPTS.md's "scheduled" state (set by publishPostDb) and must not be
 * publicly visible before its time. */
async function fetchPublishedPosts(kind?: "blog" | "recipe"): Promise<PostSummary[]> {
  const conditions = [eq(posts.status, "published"), lte(posts.publishedAt, new Date())];
  if (kind) conditions.push(eq(posts.kind, kind));

  const rows = await db
    .select({ id: posts.id, slug: posts.slug, kind: posts.kind, title: posts.title, excerpt: posts.excerpt, coverStorageKey: posts.coverStorageKey, coverAlt: posts.coverAlt, author: posts.author, publishedAt: posts.publishedAt })
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.publishedAt));

  const { publicUrl } = await import("@/lib/storage/storage");
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    kind: r.kind,
    title: r.title,
    excerpt: r.excerpt,
    coverUrl: r.coverStorageKey ? publicUrl(r.coverStorageKey) : null,
    coverAlt: r.coverAlt,
    author: r.author,
    publishedAt: r.publishedAt!,
  }));
}

/** `unstable_cache` stores its result as JSON, so every cache hit hands `publishedAt` back as an ISO string
 * despite the `Date` type — and the post pages calling `.toISOString()` on it returned a 500 on every visit
 * after the first. Revived here, where the cache is crossed, so the type stays true for every caller. */
function revivePublishedAt<T extends { publishedAt: Date }>(post: T): T {
  return { ...post, publishedAt: new Date(post.publishedAt) };
}

export async function getPublishedPosts(kind?: "blog" | "recipe"): Promise<PostSummary[]> {
  // `revalidate: 60` — the query filters `published_at <= now()`, so a scheduled post would otherwise
  // stay hidden until some unrelated edit cleared the `posts` tag; now it goes live within a minute.
  const posts = await unstable_cache(() => fetchPublishedPosts(kind), ["published-posts", kind ?? "all"], { tags: ["posts"], revalidate: 60 })();
  return posts.map(revivePublishedAt);
}

export interface PostDetail extends PostSummary {
  body: ReturnType<typeof parseTiptapDoc>;
  seoTitle: string | null;
  seoDescription: string | null;
  relatedProductIds: number[];
}

async function fetchPublishedPostBySlug(slug: string, kind: "blog" | "recipe"): Promise<PostDetail | null> {
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.kind, kind), eq(posts.status, "published"), lte(posts.publishedAt, new Date())))
    .limit(1);
  if (!row) return null;

  const { publicUrl } = await import("@/lib/storage/storage");
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.coverStorageKey ? publicUrl(row.coverStorageKey) : null,
    coverAlt: row.coverAlt,
    author: row.author,
    publishedAt: row.publishedAt!,
    body: parseTiptapDoc(row.body),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    relatedProductIds: row.relatedProductIds,
  };
}

export async function getPublishedPostBySlug(slug: string, kind: "blog" | "recipe"): Promise<PostDetail | null> {
  const post = await unstable_cache(() => fetchPublishedPostBySlug(slug, kind), ["published-post", kind, slug], {
    tags: ["posts", `post:${slug}`],
    revalidate: 60, // a scheduled post goes live within a minute (see getPublishedPosts)
  })();
  return post && revivePublishedAt(post);
}

export interface RelatedProductCard {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  imageAlt: string | null;
}

/**
 * Related products by shared tags (PROMPTS.md Phase 8 item 7) — reuses the product `tags` array
 * the same way the PDP's own "related products" does, plus any explicit `related_product_ids` on
 * the post itself. Falls back gracefully to an empty list rather than guessing.
 */
export async function getRelatedProductsForPost(relatedProductIds: number[], tags: string[]): Promise<RelatedProductCard[]> {
  const conditions = [eq(products.status, "published")];
  const idOrTag = [];
  if (relatedProductIds.length) idOrTag.push(inArray(products.id, relatedProductIds));
  if (tags.length) idOrTag.push(sql`${products.tags} && ${tags}`);
  if (idOrTag.length === 0) return [];

  const rows = await db
    .select({ id: products.id, slug: products.slug, name: products.name })
    .from(products)
    .where(and(...conditions, or(...idOrTag)))
    .limit(4);

  if (rows.length === 0) return [];
  const { publicUrl } = await import("@/lib/storage/storage");
  const images = await db
    .select()
    .from(productImages)
    .where(and(inArray(productImages.productId, rows.map((r) => r.id)), eq(productImages.isPrimary, true)));
  const imageByProduct = new Map(images.map((i) => [i.productId, i]));

  return rows.map((r) => {
    const img = imageByProduct.get(r.id);
    return { id: r.id, slug: r.slug, name: r.name, imageUrl: img ? publicUrl(img.storageKey) : null, imageAlt: img?.alt ?? null };
  });
}
