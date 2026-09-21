import { seededRandom, shuffled } from "@/lib/random";

/** The pillars a gift can come from, in the order they are listed. */
export const GIFT_PILLAR_ORDER = ["red-tea", "blue-tea", "classic-teas", "spices"] as const;

export interface GiftMenuOption {
  pillar: string;
  inStock: boolean;
}

/**
 * The gift menu: three items drawn from the pillars the shopper is NOT already buying (client brief,
 * 2026-09-20/21). Each pillar's allowed gifts are shuffled by `seed`, so the spice (or black tea) on
 * offer is different each time the popup opens rather than always the same one; the seed is fixed for
 * one opening so the menu doesn't change under the shopper.
 *
 * The menu is filled round-robin: one from each open pillar first, then second choices, until there are
 * three. So with Red, Blue and Black Tea already in the cart — spices the only pillar left — the shopper
 * gets three different spices; with a Blue + Red combo they get a black tea, a spice and another.
 *
 * When the cart already holds every pillar nothing is excluded: three of the four rotate with the seed
 * (the server accepts any gift in that case, lib/commerce/pricing.ts).
 */
export function pickGiftMenu<T extends GiftMenuOption>(options: readonly T[], cartPillars: ReadonlySet<string>, seed: number): T[] {
  const rand = seededRandom(seed);
  const allInCart = GIFT_PILLAR_ORDER.every((p) => cartPillars.has(p));
  const pillars = allInCart ? shuffled(GIFT_PILLAR_ORDER, rand) : GIFT_PILLAR_ORDER.filter((p) => !cartPillars.has(p));

  const lists = pillars.map((pillar) => shuffled(options.filter((o) => o.pillar === pillar && o.inStock), rand));
  const menu: T[] = [];
  for (let round = 0; menu.length < 3 && lists.some((l) => round < l.length); round++) {
    for (const list of lists) {
      if (menu.length < 3 && round < list.length) menu.push(list[round]);
    }
  }
  return menu;
}
