import { ShopFilterForm } from "./ShopFilterForm";
import { AutoSubmitOnChange } from "./AutoSubmitOnChange";
import type { ShopFilters } from "@/lib/db/queries/shop-query";
import type { ShopFacets } from "@/lib/db/queries/shop";

export interface FilterRailProps {
  filters: ShopFilters;
  facets: ShopFacets;
  action: string;
}

/** Desktop persistent sidebar — always in the DOM (not conditionally rendered), never hidden
 * behind a JS-gated interaction, so a no-JS request for `/shop` still gets a fully working filter
 * form (PROMPTS.md Phase 3's "filtering still works with JavaScript disabled" acceptance check).
 * The grid it sits beside never reflows when results change: this column has a fixed width and
 * the product grid's own image boxes reserve their aspect ratio up front, so a filter submit is a
 * full navigation to a differently-sized product list, not an in-place DOM mutation that could
 * shift anything. */
export function FilterRail({ filters, facets, action }: FilterRailProps) {
  return (
    <aside aria-label="Filter products" className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-64 shrink-0 overflow-y-auto pr-3 lg:block">
      <ShopFilterForm formId="shop-filters-desktop" filters={filters} facets={facets} action={action} />
      <AutoSubmitOnChange formId="shop-filters-desktop" />
    </aside>
  );
}
