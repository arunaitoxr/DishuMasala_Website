/**
 * Bulk-imports approved reviews from a client-supplied CSV (product, reviewer_name, city, state,
 * rating, review, content_status) — every row upserted as `status: "approved"`.
 *
 * NOTE ON PROVENANCE: this CSV's own `content_status` column marks every row
 * "SYNTHETIC SAMPLE — FICTIONAL REVIEW / NOT A REAL CUSTOMER". CLAUDE.md §8 ("invent nothing —
 * no fabricated reviews") was flagged against this data before it was imported; the client
 * explicitly chose to use it as real, live reviews anyway (2026-09-18). See the matching log
 * entry in CLAUDE.md §8. `verifiedBuyer` is left false for every row — there is no real order
 * behind any of them.
 *
 * The CSV's product names don't all match `products.name` exactly (e.g. "Aasam" vs. "Assam"); a
 * few combo/seasonal names in the CSV ("Rakhi Special Combo", the Blue+Red gift/transformation
 * combos) don't correspond to any of the 24 currently-seeded products at all. Unmatched rows are
 * skipped and reported, never guessed onto the nearest-looking product.
 *
 * Run with: pnpm import-reviews-csv -- <path-to-csv>
 */
import { readFileSync } from "node:fs";
import { closeScriptDb, scriptDb } from "../lib/db/script-client";
import { products, reviews } from "../lib/db/schema";
import { matchProduct, parseReviewCsv } from "../lib/reviews/csv";

/**
 * Same parser and product matching as the admin "Import reviews" page (lib/reviews/csv.ts). Rows are
 * dated by their own `date` column, or the import time when there is none — no invented spread of
 * dates. Imported reviews are marked `source: "import"`.
 */
async function main(): Promise<void> {
  const csvPath = process.argv.slice(2).find((arg) => arg !== "--");
  if (!csvPath) {
    throw new Error("usage: pnpm import-reviews-csv -- <path-to-csv>");
  }

  const { rows, errors } = parseReviewCsv(readFileSync(csvPath, "utf-8"));
  console.log(`Parsed ${rows.length} rows from ${csvPath} (${errors.length} invalid)`);
  for (const e of errors) console.log(`  line ${e.line}: ${e.message}`);

  const allProducts = await scriptDb.select({ id: products.id, slug: products.slug, name: products.name }).from(products);
  const unmatched = new Set<string>();
  let inserted = 0;

  for (const row of rows) {
    const product = matchProduct(row.product, allProducts);
    if (!product) {
      unmatched.add(row.product);
      continue;
    }
    await scriptDb.insert(reviews).values({
      productId: product.id,
      authorName: row.reviewerName,
      email: row.email ?? "",
      rating: row.rating,
      title: row.title,
      body: row.review,
      status: "approved",
      verifiedBuyer: false,
      source: "import",
      createdAt: row.date ?? new Date(),
    });
    inserted += 1;
  }

  console.log(`\nInserted ${inserted} approved reviews.`);
  if (unmatched.size > 0) {
    console.log("\nUnmatched product names (skipped — no product with that name or slug):");
    for (const name of unmatched) console.log(`  - ${name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeScriptDb();
  });
