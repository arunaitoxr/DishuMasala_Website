/**
 * "Last minute add deals" (client brief, 2026-09-20): when a shopper adds something to the cart, a
 * popup offers the other three pillars' products. Which pillars are offered for each purchase is the
 * client's own table, kept here as data — collection slugs, in the order they should appear.
 *
 * Only categories the shopper doesn't already have in their cart are offered (see `dealsFor`).
 */
export const DEALS_BY_PURCHASED: Record<string, readonly string[]> = {
  "blue-tea": ["red-tea", "spices", "classic-teas"],
  "red-tea": ["blue-tea", "spices", "classic-teas"],
  "classic-teas": ["blue-tea", "spices", "red-tea"],
  spices: ["blue-tea", "red-tea", "classic-teas"],
};

/** Every collection slug the popup needs products for. */
export const DEAL_COLLECTION_SLUGS = Object.keys(DEALS_BY_PURCHASED);

/**
 * The collections to offer after a purchase, minus any pillar already in the cart. `purchased` is every
 * pillar the added product counts as (lib/pillars.ts) — one for a plain product, two for a Blue + Red
 * tea combo, none for something that isn't in the four pillars. Offers for several pillars are merged in
 * the client's table order, without repeats.
 */
export function dealsFor(purchased: readonly string[], inCart: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const pillar of purchased) {
    for (const slug of DEALS_BY_PURCHASED[pillar] ?? []) {
      if (!inCart.has(slug) && !out.includes(slug)) out.push(slug);
    }
  }
  return out;
}
