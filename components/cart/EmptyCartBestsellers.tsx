import { ProductGrid } from "@/components/shop/ProductGrid";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { getRelatedProducts } from "@/lib/db/queries/product-detail";

/** The empty-cart page's "Bestsellers" rail — the site's top products in priority order
 * (CLAUDE.md §7.2), on the same ProductCard every other product list uses (it used to be a
 * one-off mini card with its own layout). Server Component: nothing here depends on cart state. */
export async function EmptyCartBestsellers() {
  const products = await getRelatedProducts(0, 4);
  if (products.length === 0) return null;

  return (
    <section aria-labelledby="bestsellers-heading" className="mt-14 w-full text-left">
      <SectionHeading id="bestsellers-heading" heading="Bestsellers" />
      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </section>
  );
}
