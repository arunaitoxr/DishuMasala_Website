import { HOME_COPY } from "@/content/home";

/**
 * Copy for the collection pages, which share the Corporate Gifting page's structure (client brief,
 * 2026-09-20): hero, then the products under a heading and a short intro, then the trust band, then
 * the FAQ. The hero title and subhead are the collection's own DB title and tagline; this file only
 * adds the pieces the DB has no column for.
 *
 * Every intro is existing, already-approved copy (content/home.ts, itself grounded in the client's
 * product descriptions) — nothing new is claimed here (CLAUDE.md §8).
 */
export interface CollectionPageCopy {
  /** Small label above the hero title — which pillar the collection belongs to. */
  eyebrow: string;
  productsHeading: string;
  productsIntro: string;
  /** Token background for the hero's phone copy band (and the whole hero when there is no
   * artwork) — the collection's own family colour, white text at 4.5:1 or better. */
  bandClassName: string;
  /** Eyebrow colour on ivory, from the same family (CLAUDE.md §5.6: must clear 4.5:1). */
  accentClassName: string;
}

const TEA = "Tea collection";
const MASALA = "Masala collection";

export const COLLECTION_PAGE_COPY: Record<string, CollectionPageCopy> = {
  "blue-tea": {
    eyebrow: TEA,
    productsHeading: "Choose your Blue Tea",
    productsIntro: HOME_COPY.blueTeaBand.bodySecondary,
    bandClassName: "bg-brew-1",
    accentClassName: "text-brew-2",
  },
  "red-tea": {
    eyebrow: TEA,
    productsHeading: "Choose your Red Tea",
    productsIntro: HOME_COPY.redTea.body[0],
    bandClassName: "bg-hibiscus",
    accentClassName: "text-hibiscus",
  },
  "tea-combos": {
    eyebrow: TEA,
    productsHeading: "Choose your tea pair",
    productsIntro: "Blue Tea and Red Tea together, or two packs of the same — in loose leaf or teabags.",
    bandClassName: "bg-brew-3",
    accentClassName: "text-brew-3",
  },
  "classic-teas": {
    eyebrow: TEA,
    productsHeading: "Choose your Black Tea",
    productsIntro: HOME_COPY.blackTea.body[0],
    bandClassName: "bg-leaf",
    accentClassName: "text-leaf",
  },
  spices: {
    eyebrow: MASALA,
    productsHeading: "Choose your spices",
    productsIntro: HOME_COPY.spices.body[0],
    bandClassName: "bg-chilli",
    accentClassName: "text-chilli",
  },
  combos: {
    eyebrow: MASALA,
    productsHeading: "Choose your spice set",
    productsIntro: HOME_COPY.combos.body[0],
    bandClassName: "bg-pepper",
    accentClassName: "text-chilli",
  },
};

/** Any collection added later without an entry here still gets a complete page. */
export const DEFAULT_COLLECTION_PAGE_COPY: CollectionPageCopy = {
  eyebrow: "Collection",
  productsHeading: "Choose your pack",
  productsIntro: "",
  bandClassName: "bg-brew-1",
  accentClassName: "text-brew-2",
};
