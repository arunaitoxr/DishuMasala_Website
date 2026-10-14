import type { MetadataRoute } from "next";
import { getAllPublishedProductSlugs } from "@/lib/db/queries/product-detail";
import { getAllCollectionSlugs } from "@/lib/db/queries/collections";
import { getPublishedPosts } from "@/lib/db/queries/posts";
import { getPublishedPageSlugs } from "@/lib/db/queries/pages";
import { isRequiredPageSlug, isReservedRouteSlug } from "@/lib/content/page-slugs";

/**
 * The sitemap, built from the database rather than a static list (CLAUDE.md §10). A generated
 * file would go stale the moment staff publish a product or a post in the admin — which is
 * exactly the thing the admin exists to let them do — so it is derived at request time from the
 * same queries the pages themselves use.
 *
 * Deliberately excluded: `/account/*`, `/admin/*` and `/checkout` (private or transactional),
 * `/order/*` (per-order, signed URLs), `/search` (infinite query space), and `/design-system`
 * (an internal reference page). `app/robots.ts` disallows the same set, so the two agree.
 */
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [productSlugs, collectionSlugs, posts, pages] = await Promise.all([
    getAllPublishedProductSlugs(),
    getAllCollectionSlugs(),
    getPublishedPosts(),
    getPublishedPageSlugs(),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/recipes`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/refund-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/shipping-policy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Blue Tea first, then Red Tea, then the rest — the same priority rule the storefront sorts by
  // (CLAUDE.md §7.2), expressed here as sitemap priority so it carries into crawl ordering.
  const collectionEntries: MetadataRoute.Sitemap = collectionSlugs.map((slug, i) => ({
    url: `${BASE}/collections/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: Math.max(0.6, 0.9 - i * 0.05),
  }));

  const productEntries: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: `${BASE}/product/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE}/${post.kind === "recipe" ? "recipes" : "blog"}/${post.slug}`,
    lastModified: post.publishedAt ?? now,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  // Pages created in the admin, served at /<slug> by app/[slug] (the legal pages are listed above).
  const pageEntries: MetadataRoute.Sitemap = pages
    .filter((p) => !isRequiredPageSlug(p.slug) && !isReservedRouteSlug(p.slug))
    .map((p) => ({ url: `${BASE}/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.3 }));

  return [...staticEntries, ...collectionEntries, ...productEntries, ...postEntries, ...pageEntries];
}
