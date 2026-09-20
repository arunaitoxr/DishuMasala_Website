/**
 * Seeds the database from data/catalog.json: 5 collections, 20 products, 30 variants, the
 * WELCOME5 coupon, and the settings rows CLAUDE.md §7.4 / PROMPTS.md Phase 0 call for.
 *
 * Idempotent: every insert is an upsert keyed on a natural key (collections.slug, products.slug,
 * variants.sku, coupons.code, settings.key), so re-running this script updates existing rows in
 * place instead of duplicating them. It seeds ONLY what data/catalog.json actually contains —
 * no invented reviews, customers, orders or stock counts (CLAUDE.md §7.6, §8).
 *
 * Run with: pnpm db:seed
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toPaise } from "../lib/money";
import { closeScriptDb, scriptDb } from "../lib/db/script-client";
import { collections, coupons, products, settings, variants } from "../lib/db/schema";

interface CatalogVariation {
  sku: string;
  option: string;
  mrp: number;
  price: number;
  discountPct: number;
  inStock: boolean;
}

interface CatalogProduct {
  sku: string;
  slug: string;
  name: string;
  collection: string;
  priorityRank: number;
  tags: string[];
  optionLabel: string;
  shortDescription: string;
  description: string;
  variations: CatalogVariation[];
}

interface CatalogCollection {
  slug: string;
  title: string;
  tagline: string;
  rank: number;
}

interface Catalog {
  currency: string;
  freeShippingThreshold: number;
  collections: CatalogCollection[];
  products: CatalogProduct[];
}

function loadCatalog(): Catalog {
  const raw = readFileSync(join(process.cwd(), "data/catalog.json"), "utf-8");
  return JSON.parse(raw) as Catalog;
}

async function seedCollections(catalog: Catalog): Promise<Map<string, number>> {
  const slugToId = new Map<string, number>();

  for (const c of catalog.collections) {
    const [row] = await scriptDb
      .insert(collections)
      .values({
        slug: c.slug,
        title: c.title,
        tagline: c.tagline,
        priority: c.rank,
      })
      .onConflictDoUpdate({
        target: collections.slug,
        set: {
          title: c.title,
          tagline: c.tagline,
          priority: c.rank,
        },
      })
      .returning({ id: collections.id, slug: collections.slug });

    slugToId.set(row.slug, row.id);
  }

  return slugToId;
}

async function seedProducts(
  catalog: Catalog,
  collectionIdBySlug: Map<string, number>,
): Promise<Map<string, number>> {
  const slugToId = new Map<string, number>();

  for (const p of catalog.products) {
    const collectionId = collectionIdBySlug.get(p.collection);
    if (!collectionId) {
      throw new Error(`seed: product "${p.slug}" references unknown collection "${p.collection}"`);
    }

    const [row] = await scriptDb
      .insert(products)
      .values({
        slug: p.slug,
        name: p.name,
        collectionId,
        shortDescription: p.shortDescription,
        description: p.description,
        tags: p.tags,
        optionLabel: p.optionLabel,
        priority: p.priorityRank,
        status: "published",
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          name: p.name,
          collectionId,
          shortDescription: p.shortDescription,
          description: p.description,
          tags: p.tags,
          optionLabel: p.optionLabel,
          priority: p.priorityRank,
          status: "published",
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id, slug: products.slug });

    slugToId.set(row.slug, row.id);
  }

  return slugToId;
}

async function seedVariants(catalog: Catalog, productIdBySlug: Map<string, number>): Promise<number> {
  let count = 0;

  for (const p of catalog.products) {
    const productId = productIdBySlug.get(p.slug);
    if (!productId) {
      throw new Error(`seed: no seeded product id for "${p.slug}"`);
    }

    for (const [position, v] of p.variations.entries()) {
      await scriptDb
        .insert(variants)
        .values({
          productId,
          sku: v.sku,
          optionValue: v.option,
          mrpPaise: toPaise(v.mrp),
          pricePaise: toPaise(v.price),
          inStock: v.inStock,
          position,
        })
        .onConflictDoUpdate({
          target: variants.sku,
          set: {
            productId,
            optionValue: v.option,
            mrpPaise: toPaise(v.mrp),
            pricePaise: toPaise(v.price),
            inStock: v.inStock,
            position,
          },
        });
      count += 1;
    }
  }

  return count;
}

async function seedCoupon(): Promise<void> {
  // WELCOME5 — 5% off, first order only — must exist at launch (CLAUDE.md §7.4).
  await scriptDb
    .insert(coupons)
    .values({
      code: "WELCOME5",
      kind: "percent",
      value: 5,
      firstOrderOnly: true,
      active: true,
    })
    .onConflictDoUpdate({
      target: coupons.code,
      set: {
        kind: "percent",
        value: 5,
        firstOrderOnly: true,
        active: true,
      },
    });
}

async function seedSettings(catalog: Catalog): Promise<void> {
  const rows: Array<{ key: string; value: unknown }> = [
    {
      key: "free_shipping_threshold_paise",
      value: toPaise(catalog.freeShippingThreshold),
    },
    {
      // Free-gift threshold (client, 2026-09-20): a paid cart of ₹699 or more unlocks one free gift.
      // Without this row the server never honours a gift and the popup never appears.
      key: "free_gift_threshold_paise",
      value: toPaise(699),
    },
    {
      // Real values the client has since supplied (2026-09-17, via a direct settings update —
      // this source template had drifted out of sync with the live row, and a later `db:seed`
      // rerun silently clobbered the real data back to these placeholders; keeping this template
      // current is what prevents that from happening again). GSTIN below is still genuinely
      // unknown.
      key: "store_address",
      value: {
        businessName: "Dishu Food and Beverages",
        line1: "Gali Number 3, Shekhupura Basic, Sunami Gate",
        city: "Sangrur",
        state: "Punjab",
        pincode: "148001",
        country: "India",
        phone: "+91 77102 19958",
        email: "DISHUFOODANDBEVERAGES@GMAIL.COM",
      },
    },
    {
      key: "gstin",
      value: "TODO",
    },
    {
      // Flat shipping fee charged below the free-shipping threshold. No real rate has been
      // supplied by the client yet (unlike freeShippingThreshold, catalog.json carries no such
      // figure) — ₹50 is a placeholder pending confirmation, but it lives here in `settings`
      // precisely so it is never a literal at any pricing call site (lib/commerce/pricing.ts
      // reads it the same way it reads the free-shipping threshold) and can be corrected in one
      // place without a code change once the client confirms a real number.
      key: "standard_shipping_paise",
      value: toPaise(50),
    },
    {
      // Editable from Phase 7's admin settings page (app/admin/settings) — a real, seedable
      // default rather than an invented claim.
      //
      // The WELCOME5 mention was dropped 2026-09-17: PhoneCapturePopup advertises LUCKY10 at 10%
      // off a first order, and a 5%-off code sitting in the top strip at the same time is a second,
      // worse first-order discount on the same page view. Both coupons still exist; only the strip
      // copy changed, and it now carries the shipping threshold, which applies to every shopper.
      // Kept in sync with the hardcoded fallback in components/layout/HeaderClient.tsx.
      key: "announcement_bar_text",
      value: "Free shipping over ₹499",
    },
    {
      // The degraded/maintenance banner toggle (PROMPTS.md Phase 7 item 6) — off by default.
      key: "maintenance_mode",
      value: false,
    },
  ];

  for (const row of rows) {
    await scriptDb
      .insert(settings)
      .values(row)
      .onConflictDoUpdate({ target: settings.key, set: { value: row.value } });
  }
}

async function main() {
  const catalog = loadCatalog();

  console.log(`Seeding from data/catalog.json: ${catalog.collections.length} collections, ${catalog.products.length} products`);

  const collectionIdBySlug = await seedCollections(catalog);
  console.log(`  collections: ${collectionIdBySlug.size} upserted`);

  const productIdBySlug = await seedProducts(catalog, collectionIdBySlug);
  console.log(`  products: ${productIdBySlug.size} upserted`);

  const variantCount = await seedVariants(catalog, productIdBySlug);
  console.log(`  variants: ${variantCount} upserted`);

  await seedCoupon();
  console.log("  coupon: WELCOME5 upserted");

  await seedSettings(catalog);
  console.log(
    "  settings: 7 rows upserted (free_shipping_threshold_paise, free_gift_threshold_paise, store_address, gstin, standard_shipping_paise, announcement_bar_text, maintenance_mode)",
  );

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeScriptDb();
  });
