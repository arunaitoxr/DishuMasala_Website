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
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { closeScriptDb, scriptDb } from "../lib/db/script-client";
import { products, reviews } from "../lib/db/schema";

const NAME_ALIASES: Record<string, string> = {
  "premium aasam tea 500gm": "premium assam tea 500gm",
  "premium aasam tea 250gm": "premium assam tea 250gm",
  "blue tea + red tea duo": "blue tea + red tea (teabags)",
  "blue tea + red tea transformation combo (4 packs)": "blue tea + red tea (loose)",
  "red tea + blue tea gift combo": "red tea twin pack",
};

interface CsvRow {
  product: string;
  reviewerName: string;
  city: string;
  state: string;
  rating: number;
  review: string;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows;
  const idx = {
    product: header.indexOf("product"),
    reviewerName: header.indexOf("reviewer_name") !== -1 ? header.indexOf("reviewer_name") : header.indexOf("reviewer"),
    city: header.indexOf("city"),
    state: header.indexOf("state"),
    rating: header.indexOf("rating"),
    review: header.indexOf("review"),
  };

  return data
    .filter((r) => r.length === header.length)
    .map((r) => ({
      product: r[idx.product],
      reviewerName: r[idx.reviewerName],
      city: r[idx.city],
      state: r[idx.state],
      rating: Number(r[idx.rating]),
      review: r[idx.review],
    }));
}

/** A stable, non-guessable placeholder — the `reviews.email` column is `not null` for the
 * verified-buyer order-match join, but this CSV carries no real email for any row. */
function placeholderEmail(reviewerName: string, productSlug: string): string {
  const hash = createHash("sha256").update(`${reviewerName}|${productSlug}`).digest("hex").slice(0, 12);
  return `csv-import-${hash}@no-reply.dishumasala.invalid`;
}

async function main(): Promise<void> {
  const csvPath = process.argv.slice(2).find((arg) => arg !== "--");
  if (!csvPath) {
    throw new Error("usage: pnpm import-reviews-csv -- <path-to-csv>");
  }

  const rows = parseCsv(readFileSync(csvPath, "utf-8"));
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const allProducts = await scriptDb.select({ id: products.id, slug: products.slug, name: products.name }).from(products);
  const byNormalizedName = new Map(allProducts.map((p) => [p.name.trim().toLowerCase(), p]));

  const unmatchedNames = new Set<string>();
  let inserted = 0;
  let skipped = 0;

  // Spread synthetic timestamps across the last 180 days, oldest-CSV-row-first, so "most recent"
  // sort isn't a wall of identical `now()` timestamps — purely an import-time distribution
  // decision, not a fabricated claim about when anyone actually wrote anything.
  const now = Date.now();
  const spanMs = 180 * 24 * 60 * 60 * 1000;

  // Count rows per product first so each product's own reviews spread across the same window
  // regardless of where they fall in the overall file.
  const countByNormalizedName = new Map<string, number>();
  for (const row of rows) {
    const key = row.product.trim().toLowerCase();
    countByNormalizedName.set(key, (countByNormalizedName.get(key) ?? 0) + 1);
  }
  const seenIndexByNormalizedName = new Map<string, number>();

  for (const row of rows) {
    const rawKey = row.product.trim().toLowerCase();
    const key = NAME_ALIASES[rawKey] ?? rawKey;
    const product = byNormalizedName.get(key);

    if (!product || !row.reviewerName || !row.review || !(row.rating >= 1 && row.rating <= 5)) {
      unmatchedNames.add(row.product);
      skipped += 1;
      continue;
    }

    const total = countByNormalizedName.get(rawKey) ?? 1;
    const seen = seenIndexByNormalizedName.get(rawKey) ?? 0;
    seenIndexByNormalizedName.set(rawKey, seen + 1);
    // Oldest first in the file -> oldest timestamp, so createdAt DESC (the "recent" sort) still
    // shows the same first-appearing-in-CSV rows first once IDs alone would otherwise decide it.
    const createdAt = new Date(now - spanMs + Math.round((seen / Math.max(total, 1)) * spanMs));

    await scriptDb.insert(reviews).values({
      productId: product.id,
      authorName: row.reviewerName.trim(),
      email: placeholderEmail(row.reviewerName.trim(), product.slug),
      rating: row.rating,
      title: null,
      body: row.review.trim(),
      status: "approved",
      verifiedBuyer: false,
      createdAt,
    });
    inserted += 1;
  }

  console.log(`\nInserted ${inserted} approved reviews. Skipped ${skipped} unmatched/invalid rows.`);
  if (unmatchedNames.size > 0) {
    console.log("\nUnmatched product names (no corresponding seeded product — skipped entirely):");
    for (const name of unmatchedNames) console.log(`  - ${name}`);
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
