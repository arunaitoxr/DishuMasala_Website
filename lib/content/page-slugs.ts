/**
 * Which page slugs mean what (client request 2026-10-13: pages created in the admin must be reachable).
 *
 * - `REQUIRED_PAGE_SLUGS` are the legal pages the site links to from the footer and checkout; each has
 *   its own route (app/privacy, app/terms, …). They can be edited and unpublished but not renamed or
 *   deleted, or those links would break.
 * - Any other published page is served at `/<slug>` by app/[slug]/page.tsx.
 * - `RESERVED_ROUTE_SLUGS` are the site's own top-level routes; a page can't take one of those names,
 *   because the existing route would always win and the page would never be shown.
 */
export const REQUIRED_PAGE_SLUGS = ["privacy", "terms", "refund-policy", "shipping-policy"] as const;

export const RESERVED_ROUTE_SLUGS = [
  "about", "account", "admin", "api", "auth", "blog", "cart", "checkout", "collections", "contact",
  "corporate-gifting", "design-system", "login", "order", "product", "recipes", "register",
  "reset-password", "search", "shop", "verify-email", "sitemap.xml", "robots.txt", "manifest.webmanifest",
  "icon.png", "favicon.ico", "_next",
];

export function isRequiredPageSlug(slug: string): boolean {
  return (REQUIRED_PAGE_SLUGS as readonly string[]).includes(slug);
}

export function isReservedRouteSlug(slug: string): boolean {
  return RESERVED_ROUTE_SLUGS.includes(slug);
}
