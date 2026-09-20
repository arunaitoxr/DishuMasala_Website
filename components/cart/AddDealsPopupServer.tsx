import { getPublishedProductsByCollectionSlug } from "@/lib/db/queries/products";
import { DEAL_COLLECTION_SLUGS } from "@/lib/deals";
import { AddDealsPopup, type DealCandidate } from "./AddDealsPopup";

/** Server wrapper for AddDealsPopup — reads the four pillar collections (cached, tagged) and reduces
 * them to one lead product per pillar plus a product → pillar map. Same server/client split as
 * FreeGiftOptionsServer.tsx. */
export async function AddDealsPopupServer() {
  const perCollection = await Promise.all(DEAL_COLLECTION_SLUGS.map((slug) => getPublishedProductsByCollectionSlug(slug)));

  const candidates: DealCandidate[] = [];
  const productCollections: Record<number, string> = {};

  perCollection.forEach((products, i) => {
    const slug = DEAL_COLLECTION_SLUGS[i];
    for (const p of products) productCollections[p.id] = slug;

    // The pillar's lead product: first in the collection's own order that has something in stock.
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
      break;
    }
  });

  if (candidates.length === 0) return null;
  return <AddDealsPopup candidates={candidates} productCollections={productCollections} />;
}
