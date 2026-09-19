/**
 * The benefit strip that scrolls directly under the Blue Tea and Red Tea collection banners.
 *
 * Client-supplied copy, written request 2026-09-17 (bug list row 3: "add one more line to it",
 * location "below the category banners of blue tea , red tea"). Same standing basis as CLAUDE.md
 * §8's logged banner-copy exceptions — §8 bans this project inventing product claims on its own
 * initiative, and explicitly allows them where "the client wants more, they supply it in writing",
 * which this is. Not a precedent for writing new claims ourselves.
 *
 * **Scoped to the herbal-tea collections on purpose, and it must stay that way.** Two of these
 * claims are only true there: Blue Tea and Red Tea are caffeine-free herbal infusions, while
 * Classic Tea and Premium Assam Tea are black teas that genuinely do contain caffeine
 * (content/faq.ts says so on the record). Showing "Zero Caffeine" on /collections/classic-teas
 * would not be a marketing liberty, it would be false. `COLLECTIONS_WITH_BENEFIT_STRIP` below is
 * the guard — add a slug to it only after checking every claim holds for that collection.
 */

export interface CollectionBenefit {
  label: string;
}

export const TEA_BENEFIT_STRIP: readonly CollectionBenefit[] = [
  { label: "No preservatives" },
  { label: "Plant-Based Teabags" },
  { label: "Zero Caffeine" },
  { label: "Farm-fresh Quality" },
  { label: "All Natural" },
] as const;

/**
 * Which collection pages render the strip.
 *
 * `blue-tea` and `red-tea` are the client's own two. `tea-combos` is included because its four
 * products are literally those same Blue and Red teas boxed together — every claim above holds
 * verbatim, and leaving it off would give the client a visibly different page for the same goods,
 * which is the inconsistency they asked to be rid of. Flagged rather than assumed: if they want
 * it on exactly the two pages they named, delete the third entry.
 */
export const COLLECTIONS_WITH_BENEFIT_STRIP = new Set(["blue-tea", "red-tea", "tea-combos"]);

/**
 * The homepage's benefit strip, directly under the hero banner — the same strip, in the same quiet
 * style, as the one on the herbal-tea collection pages (one treatment for one kind of content).
 *
 * One deliberate difference: the homepage speaks for the whole range, and the Black Teas (Classic
 * Tea, Premium Assam Tea) do contain caffeine — client confirmed 2026-09-20. So the homepage says
 * which teas are caffeine-free instead of a site-wide "Zero Caffeine", which would be false for two
 * products on the same page.
 */
export const HOME_BENEFIT_STRIP: readonly CollectionBenefit[] = [
  { label: "No preservatives" },
  { label: "Plant-Based Teabags" },
  { label: "Caffeine-free herbal teas" },
  { label: "Farm-fresh Quality" },
  { label: "All Natural" },
] as const;
