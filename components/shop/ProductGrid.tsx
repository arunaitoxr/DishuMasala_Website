import { ProductCard } from "@/components/product/ProductCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { toProductCardProps } from "@/lib/product-card";
import type { ProductCardData } from "@/types/catalog";

export interface ProductGridProps {
  products: ProductCardData[];
}

/** 2-up / 3-up / 4-up responsive grid (PROMPTS.md Phase 3 item 4). Each `ProductCard`'s image box
 * already reserves its own aspect ratio (Phase 1), so the grid itself never reflows once a
 * product's real image loads — confirmed still true here since nothing in this layer overrides
 * that sizing. `items-stretch` + `h-full` on every card (client request: uniform card dimensions
 * site-wide, not just the homepage carousels) — without it, a grid row's cards only match height
 * when every product name happens to wrap the same number of lines. Cards appear at once — the
 * staggered fade-in was dropped (2026-09-20) with the other decorative motion: products should be
 * there when the page is, and the colour bands stay the one signature motion. */
export function ProductGrid({ products }: ProductGridProps) {
  return (
    <ul className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4 xl:gap-6">
      {products.map((p) => (
        <li key={p.slug} className="flex">
          <ProductCard {...toProductCardProps(p)} className="h-full w-full" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Real skeleton loading state (PROMPTS.md Phase 3 item 4: "real skeleton loading states", not a
 * spinner). Same grid columns and the same 1:1 image aspect ratio `ProductCard` reserves, plus
 * placeholder bars for name/price/button, so swapping the real grid in would cause zero layout
 * shift. `count` defaults to one full page (`SHOP_PAGE_SIZE`).
 *
 * Deliberately NOT wired into an `app/shop/loading.tsx` route-level Suspense boundary — that was
 * the first implementation, and it broke the harder, explicitly-tested requirement: a
 * `loading.tsx` sibling makes Next.js stream the page (send the skeleton first, then a `<script>`
 * that swaps in the real content once it resolves). That swap script never runs with JavaScript
 * disabled, so a no-JS request gets stuck on the skeleton forever — confirmed with a real
 * Playwright run (`javaScriptEnabled: false`) against `/shop`, which is a much stronger check than
 * curling the raw response (curl captures every streamed chunk concatenated together, including
 * the real content, so it looked fine there and only failed in an actual browser). `/shop` renders
 * fully synchronously instead (no loading.tsx, no top-level Suspense), so the very first response
 * is already the complete, final HTML — this component stays exported for a future spot where
 * streaming is actually safe (e.g. a client-side-only interaction that doesn't need to work
 * without JS at all).
 */
export function ProductGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4 xl:gap-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-3">
          <Skeleton style={{ aspectRatio: "1 / 1" }} className="w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full rounded-md" />
        </li>
      ))}
    </ul>
  );
}
