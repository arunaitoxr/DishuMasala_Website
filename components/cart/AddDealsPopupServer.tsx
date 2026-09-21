import { getPublishedProductsByCollectionSlug } from "@/lib/db/queries/products";
import { DEAL_COLLECTION_SLUGS } from "@/lib/deals";
import { pillarsOf } from "@/lib/pillars";
import { AddDealsPopup, type DealCandidate } from "./AddDealsPopup";

/** Server wrapper for AddDealsPopup — reads the four pillar collections (cached, tagged) and reduces
 * them to one lead product per pillar plus a product → pillar map. Same server/client split as
 * FreeGiftOptionsServer.tsx. */
export async function AddDealsPopupServer() {
  // The four pillar collections supply the products to offer; the two combo collections are read only
  // so an add of a combo can be classified (a spice combo is "spices", a tea combo is its teas).
  const combos = await Promise.all(["combos", "tea-combos"].map((slug) => getPublishedProductsByCollectionSlug(slug)));
  const perCollection = await Promise.all(DEAL_COLLECTION_SLUGS.map((slug) => getPublishedProductsByCollectionSlug(slug)));

  const candidates: DealCandidate[] = [];
  const productPillars: Record<number, string[]> = {};
  for (const p of combos.flat()) productPillars[p.id] = pillarsOf(p.collectionSlug, p.slug);

  perCollection.forEach((products, i) => {
    const slug = DEAL_COLLECTION_SLUGS[i];
    for (const p of products) productPillars[p.id] = pillarsOf(slug, p.slug);

    // Every in-stock product of the pillar is a candidate; the popup picks one at random per opening.
    for (const p of products) {
      const inStock = p.variants.filter((v) => v.inStock);
      if (inStock.length === 0) continue;
      const cheapest = inStock.reduce((a, b) => (b.pricePaise < a.pricePaise ? b : a));
      const image = p.images[0];
      candidates.push({
        productId: p.id,
        collectionSlug: slug,
        collectionTitle: p.collectionTitle,
        priority: p.priority,
        name: p.name,
        href: `/product/${p.slug}/`,
        image: image ? { url: image.url, alt: image.alt } : null,
        variant: {
          id: cheapest.id,
          sku: cheapest.sku,
          optionValue: cheapest.optionValue,
          mrpPaise: cheapest.mrpPaise,
          pricePaise: cheapest.pricePaise,
        },
        variantCount: inStock.length,
      });
    }
  });

  if (candidates.length === 0) return null;
  return <AddDealsPopup candidates={candidates} productPillars={productPillars} />;
}
