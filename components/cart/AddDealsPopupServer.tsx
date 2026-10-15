import { getPublishedProductsByCollectionSlug } from "@/lib/db/queries/products";
import { getFreeGiftThresholdPaise } from "@/lib/db/queries/settings";
import { DEAL_SHELF_SLUGS, EVERY_SIZE_COLLECTIONS } from "@/lib/deals";
import { pillarsOf } from "@/lib/pillars";
import { AddDealsPopup, type DealCandidate } from "./AddDealsPopup";

/** Server wrapper for AddDealsPopup — reads the four pillar collections and the two combo collections
 * (cached, tagged) and reduces them to every in-stock product (spices and spice combos: every in-stock
 * pack size) plus a product → pillar map, along with the free-gift threshold the popup's nudge line
 * names. Same server/client split as FreeGiftOptionsServer.tsx. */
export async function AddDealsPopupServer() {
  const [perCollection, freeGiftThresholdPaise] = await Promise.all([
    Promise.all(DEAL_SHELF_SLUGS.map((slug) => getPublishedProductsByCollectionSlug(slug))),
    getFreeGiftThresholdPaise(),
  ]);

  const candidates: DealCandidate[] = [];
  // Which pillar(s) each product counts as, so an add can be classified (a spice combo is "spices", a
  // Blue + Red tea combo is both teas) and the client's table can pick what leads.
  const productPillars: Record<number, string[]> = {};

  perCollection.forEach((products, i) => {
    const slug = DEAL_SHELF_SLUGS[i];
    for (const p of products) productPillars[p.id] = pillarsOf(slug, p.slug);

    // Every in-stock product is a candidate; the popup shows all not yet in the cart. Most get one card
    // at their cheapest pack; spices and spice combos get a card per pack size (EVERY_SIZE_COLLECTIONS).
    for (const p of products) {
      const inStock = [...p.variants.filter((v) => v.inStock)].sort((a, b) => a.pricePaise - b.pricePaise);
      if (inStock.length === 0) continue;
      const everySize = EVERY_SIZE_COLLECTIONS.has(slug);
      const image = p.images[0];
      for (const v of everySize ? inStock : inStock.slice(0, 1)) {
        candidates.push({
          productId: p.id,
          collectionSlug: slug,
          collectionTitle: p.collectionTitle,
          priority: p.priority,
          name: p.name,
          href: `/product/${p.slug}/`,
          image: image ? { url: image.url, alt: image.alt } : null,
          variant: { id: v.id, sku: v.sku, optionValue: v.optionValue, mrpPaise: v.mrpPaise, pricePaise: v.pricePaise },
          sizeLabel: v.optionValue,
        });
      }
    }
  });

  if (candidates.length === 0) return null;
  return (
    <AddDealsPopup candidates={candidates} productPillars={productPillars} freeGiftThresholdPaise={freeGiftThresholdPaise} />
  );
}
