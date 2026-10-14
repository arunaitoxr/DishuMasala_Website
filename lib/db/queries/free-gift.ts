import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { productImages, products, variants } from "../schema";
import { paise, type Paise } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";

export type GiftPillar = "blue-tea" | "red-tea" | "spices" | "classic-teas";

export interface FreeGiftOption {
  variantId: number;
  productId: number;
  priority: number;
  productName: string;
  slug: string;
  optionValue: string;
  sku: string;
  mrpPaise: Paise;
  inStock: boolean;
  image: { url: string; alt: string } | null;
  /** Which pillar this gift belongs to — components/cart/FreeGiftPopup.tsx hides a pillar's own
   * gift(s) whenever the cart already contains a paid item from that same pillar (client rule,
   * 2026-09-17: buying Blue Tea offers Red Tea/Spices/Black Tea as gifts, never another Blue Tea). */
  pillar: GiftPillar;
}

/**
 * The real, exact SKUs the client chose as free-gift options (2026-09-17) — deliberately a fixed
 * allowlist by SKU, not a generic "any 100g spice" rule like the previous version: the client
 * specifically wants only Coriander/Turmeric/Red Chilli (not Black Pepper or Garam Masala) for the
 * spices pillar, and a genuinely smaller "20 gm" pack for the two loose teas rather than their
 * existing 52g/100g sizes. `lib/commerce/pricing.ts`'s own eligibility check uses this exact same
 * list, so what this menu offers and what the server will actually honour never drift apart.
 *
 * The two "20 gm" tea SKUs and two "100 gm" black-tea SKUs are PLACEHOLDER pricing — proportionally
 * derived from each product's existing larger pack (client decision, 2026-09-17: use an estimate
 * for now rather than block on a real quoted price) — see each new `variants` row's source comment
 * in data/catalog.json. Revisit the moment the client confirms a real number.
 */
const GIFT_SKUS: Record<string, GiftPillar> = {
  "0023-20-gm": "blue-tea", // Premium Herbal Blue Tea (loose), 20 gm
  "0032-20-gm": "red-tea", // Premium Herbal Red Tea (loose), 20 gm
  "0026-100-gm": "spices", // Coriander Powder, 100 gm
  "0021-100-gm": "spices", // Turmeric Powder (Haldi Powder), 100 gm
  "0022-100-gm": "spices", // Red Chilli Powder, 100 gm
  "0030-100-gm": "classic-teas", // Classic Tea, 100 gm
  "0035-100-gm": "classic-teas", // Premium Assam Tea, 100 gm
};

export async function getFreeGiftOptions(): Promise<FreeGiftOption[]> {
  const skus = Object.keys(GIFT_SKUS);
  const rows = await Promise.all(
    skus.map((sku) =>
      db
        .select({
          variantId: variants.id,
          productId: products.id,
          priority: products.priority,
          productName: products.name,
          slug: products.slug,
          optionValue: variants.optionValue,
          sku: variants.sku,
          mrpPaise: variants.mrpPaise,
          inStock: variants.inStock,
        })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(and(eq(variants.sku, sku), eq(products.status, "published")))
        .limit(1)
        .then((r) => r[0]),
    ),
  );

  const found = rows.filter((r): r is NonNullable<typeof r> => r != null);
  const productIds = found.map((r) => r.productId);
  const imageRows = productIds.length
    ? await db
        .select({ productId: productImages.productId, storageKey: productImages.storageKey, alt: productImages.alt })
        .from(productImages)
        .where(eq(productImages.isPrimary, true))
    : [];
  const imageByProduct = new Map(imageRows.filter((i) => productIds.includes(i.productId)).map((i) => [i.productId, i]));

  return found.map((r) => {
    const img = imageByProduct.get(r.productId);
    return {
      variantId: r.variantId,
      productId: r.productId,
      priority: r.priority,
      productName: r.productName,
      slug: r.slug,
      optionValue: r.optionValue,
      sku: r.sku,
      mrpPaise: paise(r.mrpPaise),
      inStock: r.inStock,
      image: img ? { url: publicUrl(img.storageKey), alt: img.alt } : null,
      pillar: GIFT_SKUS[r.sku],
    };
  });
}
