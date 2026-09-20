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
 * The collections to offer after `purchased` was added, minus any already in the cart. Empty when the
 * purchase isn't one of the four pillars (combos, gifts…) or there is nothing left to offer.
 */
export function dealsFor(purchased: string | undefined, inCart: ReadonlySet<string>): string[] {
  if (!purchased) return [];
  return (DEALS_BY_PURCHASED[purchased] ?? []).filter((slug) => !inCart.has(slug));
}
