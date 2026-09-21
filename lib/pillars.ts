/**
 * Which of the four categories ("pillars") a product counts as, for the cross-sell rules — the
 * last-minute deals popup (lib/deals.ts) and the free-gift menu and its server check
 * (lib/commerce/pricing.ts). Combos are not a pillar of their own (client, 2026-09-21: the popups must
 * work for combos too): a spice combo counts as spices; a tea combo counts as whichever teas it
 * contains, read from its slug ("blue-tea-red-tea-…-combo" is both, "blue-tea-twin-pack" is Blue Tea).
 * Pure and shared by server and client so the menu shown and the rule enforced can't drift apart.
 */
export type Pillar = "blue-tea" | "red-tea" | "classic-teas" | "spices";

const PILLAR_COLLECTIONS: readonly string[] = ["blue-tea", "red-tea", "classic-teas", "spices"];

export function pillarsOf(collectionSlug: string, productSlug?: string | null): Pillar[] {
  if (PILLAR_COLLECTIONS.includes(collectionSlug)) return [collectionSlug as Pillar];
  if (collectionSlug === "combos") return ["spices"];
  if (collectionSlug === "tea-combos" && productSlug) {
    const out: Pillar[] = [];
    if (productSlug.includes("blue-tea")) out.push("blue-tea");
    if (productSlug.includes("red-tea")) out.push("red-tea");
    return out;
  }
  return [];
}
