import type { Metadata } from "next";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { searchProducts } from "@/lib/db/queries/search";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

interface SearchPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

function firstQ(q: string | string[] | undefined): string {
  return (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const q = firstQ((await searchParams).q);
  return {
    title: q ? `Search — "${q}"` : "Search",
    // Search results pages are near-duplicate/thin-content by nature and infinite in combination —
    // never worth indexing (unlike /shop's filtered views, which are a bounded, useful set).
    robots: { index: false, follow: true },
  };
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-9 text-brew-2" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m18 18-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** `/search?q=` (PROMPTS.md Phase 3 item 6). A real `<form method="GET">` so search itself works
 * with JavaScript disabled, over `name/tags/short_description` via ILIKE + pg_trgm similarity
 * (lib/db/queries/search.ts) — no external search service for a 20-product catalogue. Both the
 * empty-query and no-results states explain themselves in words and offer a way back out, rather
 * than rendering a silent blank grid. */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const q = firstQ((await searchParams).q);
  const results = q ? await searchProducts(q) : [];

  return (
    <div className={cn(PAGE_CONTAINER, "py-10 lg:py-14")}>
      <h1 className="type-page-title text-ink">Search</h1>

      <form method="GET" action="/search/" role="search" className="mt-6 flex max-w-lg gap-2">
        <label htmlFor="search-q" className="sr-only">
          Search products
        </label>
        <input
          id="search-q"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search teas, spices, combos…"
          className="h-12 w-full rounded-md border border-line bg-surface px-4 text-[0.95rem] text-ink placeholder:text-ink-3"
        />
        <button type="submit" className="h-12 shrink-0 rounded-md bg-ink px-5 text-sm font-semibold text-surface">
          Search
        </button>
      </form>

      <div className="mt-10">
        {q === "" ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-2 px-6 py-16 text-center">
            <SearchIcon />
            <p className="max-w-sm text-ink-2">
              Type a product name, ingredient or tag above — try &ldquo;blue tea&rdquo;, &ldquo;turmeric&rdquo; or
              &ldquo;combo&rdquo;.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-2 px-6 py-16 text-center">
            <SearchIcon />
            <p className="max-w-sm text-ink-2">
              No products match &ldquo;{q}&rdquo;. Check the spelling, try a shorter or more general word, or
              browse everything instead.
            </p>
            <a href="/shop/" className="text-sm font-semibold text-brew-2 underline underline-offset-4">
              Browse the full shop
            </a>
          </div>
        ) : (
          <>
            <p className="mb-6 text-ink-2">
              {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
            </p>
            <ProductGrid products={results} />
          </>
        )}
      </div>
    </div>
  );
}
