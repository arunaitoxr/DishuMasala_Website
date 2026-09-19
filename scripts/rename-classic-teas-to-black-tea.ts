/**
 * Operational, one-off (client request, 2026-09-20): the `classic-teas` collection is shown to
 * shoppers as "Black Tea" everywhere — nav, category circles, card chips, collection page, footer,
 * shop filter, breadcrumbs. Until now only the nav and the homepage circles carried that name, via
 * two separate display aliases, while every other surface still read "Classic & Assam" from the
 * database; the same collection had two names on one page. Renaming the stored title makes the
 * database the single source again and lets both aliases go.
 *
 * The slug stays `classic-teas`, so every /collections/classic-teas/ URL, redirect and ranking is
 * untouched. data/catalog.json carries the same title, so a re-seed keeps it.
 *
 * Usage: pnpm rename-classic-teas-to-black-tea
 */
import { closeScriptDb, eq, scriptDb } from "../lib/db/script-client";
import { collections } from "../lib/db/schema";

const SLUG = "classic-teas";
const TITLE = "Black Tea";

async function main() {
  const updated = await scriptDb
    .update(collections)
    .set({ title: TITLE })
    .where(eq(collections.slug, SLUG))
    .returning({ id: collections.id, title: collections.title });
  if (updated.length === 0) throw new Error(`No collection with slug "${SLUG}".`);
  console.log(`collections.${SLUG} renamed to "${TITLE}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeScriptDb);
