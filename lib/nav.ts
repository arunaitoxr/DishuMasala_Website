import type { CollectionSummary } from "@/types/catalog";

/**
 * Which collections group under the "Teas" and "Masala" mega-menu columns (CLAUDE.md §7.2,
 * amended: two co-equal pillars, not a single cascade). The schema has no nav-grouping column —
 * `collections` is a flat, priority-ordered list — so these fixed sets are the one piece of
 * navigation structure not read from the database; the ORDER within and across columns still comes
 * entirely from `collections.priority` via the DB, never a literal number here.
 */
/**
 * `tea-combos` joins the Teas column and `combos` stays in Masala (2026-09-17, client): the two
 * combo ranges are separate menu entries because they are separate products — `tea-combos` holds
 * only the Blue/Red tea pairs and twin packs, `combos` only the spice sets. `combos` keeps its slug
 * so every legacy /collections/combos/ URL and redirect still resolves; only its display title
 * changed, to "Spice Combos".
 */
export const TEA_COLLECTION_SLUGS = new Set(["blue-tea", "red-tea", "classic-teas", "tea-combos"]);
export const MASALA_COLLECTION_SLUGS = new Set(["spices", "combos"]);

/** Collections that get the small Lemon Shift gradient tile in the mega-menu (CLAUDE.md §5.4:
 * "Blue Tea and Red Tea collection tiles" — Black Tea does not). */
export const GRADIENT_TILE_SLUGS = new Set(["blue-tea", "red-tea"]);

export interface MegaMenuColumn {
  label: string;
  items: CollectionSummary[];
}

/**
 * Buckets DB-priority-ordered collections into mega-menu columns: one "Teas" column and one
 * "Masala" column (if either has any members), each internally still in `priority` order, followed
 * by one column per any other collection, in the same relative order the database returned them in
 * (`getCollectionsWithStats()` already sorts by `priority` asc). Two equal-weight named columns
 * instead of "Teas" plus two flat, unlabelled misc columns (Spices, Combo Packs) is the point —
 * CLAUDE.md §7.2's amendment asks for Tea and Masala to read as co-equal pillars, and an unnamed
 * flat column next to a named "Teas" column doesn't read that way even once priority is interleaved.
 */
export function buildMegaMenuColumns(collections: CollectionSummary[]): MegaMenuColumn[] {
  const teas = collections.filter((c) => TEA_COLLECTION_SLUGS.has(c.slug));
  const masala = collections.filter((c) => MASALA_COLLECTION_SLUGS.has(c.slug));
  const rest = collections.filter(
    (c) => !TEA_COLLECTION_SLUGS.has(c.slug) && !MASALA_COLLECTION_SLUGS.has(c.slug),
  );

  const columns: MegaMenuColumn[] = [];
  if (teas.length > 0) columns.push({ label: "Teas", items: teas });
  if (masala.length > 0) columns.push({ label: "Masala", items: masala });
  for (const c of rest) columns.push({ label: c.title, items: [c] });
  return columns;
}
