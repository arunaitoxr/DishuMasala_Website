import type { Metadata } from "next";
import { FilterRail } from "@/components/shop/FilterRail";
import { FilterSheet } from "@/components/shop/FilterSheet";
import { SortSelect } from "@/components/shop/SortSelect";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { PaginationLinks } from "@/components/ui/PaginationLinks";
import { Placeholder } from "@/components/media/Placeholder";
import { PageHero } from "@/components/sections/PageHero";
import { Button } from "@/components/ui/Button";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import { getShopFacets, getShopPage } from "@/lib/db/queries/shop";
import { parseShopSearchParams, shopFiltersToSearchParams, type ShopFilters } from "@/lib/db/queries/shop-query";

interface ShopPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildShopUrl(filters: ShopFilters, overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...shopFiltersToSearchParams(filters), ...overrides });
  // Explicit page=1 links (e.g. "Clear all") shouldn't carry a redundant ?page=1.
  if (params.get("page") === "1") params.delete("page");
  const qs = params.toString();
  return qs ? `/shop/?${qs}` : "/shop/";
}

function describeFilters(filters: ShopFilters, collectionTitle?: string): string {
  const parts: string[] = [];
  if (filters.collection) parts.push(collectionTitle ?? filters.collection.replace(/-/g, " "));
  if (filters.optionLabel) parts.push(filters.optionLabel.toLowerCase());
  if (filters.inStockOnly) parts.push("in stock");
  if (filters.priceMinRupees != null || filters.priceMaxRupees != null) parts.push("filtered by price");
  return parts.join(", ");
}

/** Every distinct filtered/sorted view is its own crawlable, shareable URL (PROMPTS.md Phase 3
 * item 1) — so it gets its own title, description and canonical here, not a single static one for
 * the whole route. The default (unfiltered, page 1) view is the one search engines should index;
 * every filtered/paginated variant is a real, working page but points its canonical at itself
 * (still indexable — a 20-SKU catalogue has no thin-content risk from a handful of filter
 * combinations) so nothing here silently canonicalises traffic away from a page a shopper might
 * actually land on and want to share. */
export async function generateMetadata({ searchParams }: ShopPageProps): Promise<Metadata> {
  const filters = parseShopSearchParams(await searchParams);
  const described = describeFilters(filters);
  const title = described ? `Shop — ${described}` : "Shop all products";
  const description = described
    ? `Dishu Masala's organic spices and herbal teas, filtered to ${described}. Free shipping over ₹500.`
    : "Every Dishu Masala product in one place — organic Indian spices and herbal teas, including the colour-changing Blue Tea. Free shipping over ₹500.";
  const canonical = buildShopUrl(filters);

  return {
    title,
    description,
    alternates: { canonical },
    robots: filters.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const filters = parseShopSearchParams(await searchParams);
  const [page, facets] = await Promise.all([getShopPage(filters), getShopFacets(filters)]);

  const activeFilterCount = [
    filters.collection,
    filters.optionLabel,
    filters.inStockOnly ? true : undefined,
    filters.priceMinRupees != null || filters.priceMaxRupees != null ? true : undefined,
  ].filter(Boolean).length;

  const described = describeFilters(filters, facets.collections.find((c) => c.slug === filters.collection)?.title);

  return (
    <>
      {/* The same hero as the collection pages and Corporate Gifting — "All products" sits in the nav
          beside the collections, so it opens the same way they do. Titled to match the nav label. */}
      <PageHero
        ariaLabel="All products"
        eyebrow="Tea & masala"
        heading="All products"
        subhead="Every Dishu herbal tea, black tea, spice and combo in one place."
        image={null}
        bandClassName="bg-brew-1"
      />
    <div className={cn(PAGE_CONTAINER, "py-10 lg:py-14")}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <FilterRail filters={filters} facets={facets} action="/shop/" />

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-between gap-3 border-y border-line py-3 sm:mb-7">
            <FilterSheet filters={filters} facets={facets} action="/shop/" activeCount={activeFilterCount} />
            <p className="text-sm text-ink-2">
              <span className="font-semibold tabular-nums text-ink">{page.totalCount}</span> product{page.totalCount === 1 ? "" : "s"}
              {described ? ` — ${described}` : ""}
            </p>
            <SortSelect filters={filters} action="/shop/" className="ml-auto" />
          </div>

          {page.products.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface-2 px-6 py-16 text-center">
              <Placeholder slot="product-packshot-generic" className="size-24" />
              <p className="max-w-sm text-ink-2">
                No products match these filters. Try widening the price range, clearing the type filter,
                or removing the collection filter.
              </p>
              <Button asChild variant="outline" size="md">
                <a href="/shop/">Clear all filters</a>
              </Button>
            </div>
          ) : (
            <>
              <ProductGrid products={page.products} />
              <PaginationLinks
                page={page.page}
                totalPages={page.totalPages}
                hrefFor={(p) => buildShopUrl(filters, { page: String(p) })}
                className="mt-10 justify-center"
              />
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
