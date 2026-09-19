/**
 * Operational, one-off (client request, 2026-09-20): Blue Tea (teabags) keeps only its three packs —
 * Starter (1 Pack), Value (2 Packs), Transformation (3 Packs), the same three data/catalog.json has
 * always listed. The database also held three older duplicates ("36", "36 x2", "36 x4") from before
 * the packs were renamed, so the product page offered six options for three products, two of them at
 * the same ₹628 price.
 *
 * Deleting is safe for order history: `order_items.variant_id` is `on delete set null`, and every
 * order line keeps its own snapshot of name, SKU and price (CLAUDE.md §4). Checked before running —
 * the only order lines on these variants were test orders (@example.com). A saved cart line on one of
 * them is removed with it (`cart_items` cascades).
 *
 * Usage: pnpm remove-duplicate-blue-tea-teabag-variants
 */
import { and, closeScriptDb, eq, inArray, scriptDb } from "../lib/db/script-client";
import { products, variants } from "../lib/db/schema";

const SLUG = "premium-herbal-blue-tea-teabags";
const REMOVE = ["0024-36", "0024-36-2PK", "0024-36-4PK"];
const KEEP_IN_ORDER = ["0024-S", "0024-V", "0024-T"];

async function main() {
  const [product] = await scriptDb.select({ id: products.id }).from(products).where(eq(products.slug, SLUG)).limit(1);
  if (!product) throw new Error(`product "${SLUG}" not found`);

  const removed = await scriptDb
    .delete(variants)
    .where(and(eq(variants.productId, product.id), inArray(variants.sku, REMOVE)))
    .returning({ sku: variants.sku, optionValue: variants.optionValue });
  console.log(`removed ${removed.length}: ${removed.map((v) => `${v.sku} (${v.optionValue})`).join(", ") || "none"}`);

  for (const [position, sku] of KEEP_IN_ORDER.entries()) {
    await scriptDb.update(variants).set({ position }).where(and(eq(variants.productId, product.id), eq(variants.sku, sku)));
  }
  console.log(`positions set: ${KEEP_IN_ORDER.join(" -> ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeScriptDb);
