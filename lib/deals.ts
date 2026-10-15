import { shuffled } from "@/lib/random";

/**
 * "Last minute add deals" (client brief, 2026-09-20): when a shopper adds something to the cart, a
 * popup offers the other three pillars' products. Which pillars are offered for each purchase is the
 * client's own table, kept here as data — collection slugs, in the order they should appear.
 *
 * The categories the shopper doesn't already have in their cart lead (see `dealsFor`); every other
 * product not yet in the cart follows them in the popup's scroller (see `dealShelf`).
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
 * The combo collections. They aren't in the client's table (they never lead), but the scroller shows
 * every product not yet in the cart (client request, 2026-10-15), so they follow the four pillars.
 */
export const COMBO_SHELF_SLUGS = ["tea-combos", "combos"];

/** Every collection the scroller draws from: the four pillars, then the combos. */
export const DEAL_SHELF_SLUGS = [...DEAL_COLLECTION_SLUGS, ...COMBO_SHELF_SLUGS];

/**
 * Collections whose products get one card per pack size rather than one card at the cheapest size
 * (client request, 2026-10-15: the spices showed only their 100 gm packs — the 200 gm packs should be
 * there too; spice combos come in the same two sizes). Teas and tea combos keep one card each: teas
 * come in up to four sizes, which would crowd the scroller.
 */
export const EVERY_SIZE_COLLECTIONS: ReadonlySet<string> = new Set(["spices", "combos"]);

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

/**
 * Every card the popup's scroller shows, in order (client requests, 2026-10-10 and 2026-10-15: every
 * product not already in the cart, with left/right arrows, not just one per pillar). The client's table
 * still leads — the pillars `dealsFor` picks, taking one product of each in turn, so the first cards in
 * view are still one per pillar — then every other pillar the same way, then the combos. Products
 * already in the cart (the one just added included) are left out, all their sizes. Each collection's
 * products are shuffled with `rand`, so the lead cards change from one opening to the next; a product
 * with a card per size (`EVERY_SIZE_COLLECTIONS`) keeps its sizes next to each other, in the order given.
 */
export function dealShelf<T extends { productId: number }>(
  purchased: readonly string[],
  inCart: { pillars: ReadonlySet<string>; productIds: ReadonlySet<number> },
  productsBySlug: ReadonlyMap<string, readonly T[]>,
  rand: () => number,
): T[] {
  const recommended = dealsFor(purchased, inCart.pillars);
  const rest = DEAL_COLLECTION_SLUGS.filter((slug) => !recommended.includes(slug));
  const pool = (slug: string) =>
    shuffled(groupByProduct((productsBySlug.get(slug) ?? []).filter((p) => !inCart.productIds.has(p.productId))), rand);
  return [...interleave(recommended.map(pool)), ...interleave(rest.map(pool)), ...interleave(COMBO_SHELF_SLUGS.map(pool))].flat();
}

/** One group per product (its size cards, in the order given), products in first-seen order. */
function groupByProduct<T extends { productId: number }>(items: readonly T[]): T[][] {
  const groups = new Map<number, T[]>();
  for (const item of items) groups.set(item.productId, [...(groups.get(item.productId) ?? []), item]);
  return [...groups.values()];
}

/** Round-robin across lists: the first of each, then the second of each, and so on. */
function interleave<T>(lists: readonly T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((list) => i < list.length); i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}
