import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { CollectionFaq } from "@/components/sections/CollectionFaq";
import { MarqueeStrip } from "@/components/layout/MarqueeStrip";
import { COLLECTIONS_WITH_BENEFIT_STRIP, TEA_BENEFIT_STRIP } from "@/content/collection-benefits";
import { getAllCollectionSlugs, getCollectionBySlug } from "@/lib/db/queries/collections";
import { getPublishedProductsByCollectionSlug } from "@/lib/db/queries/products";
import { GRADIENT_TILE_SLUGS } from "@/lib/nav";
import { resolveFamilyAccent, familyAccentVar } from "@/lib/family-accent";
import { CATEGORY_BANNER_ASSETS } from "@/content/category-banners";
import { CollectionHero } from "@/components/collections/CollectionHero";

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

/** All 5 collection slugs, known at build time (CLAUDE.md §6's fixed catalogue shape) — statically
 * generates every `/collections/<slug>/` page rather than rendering them on demand. */
export async function generateStaticParams() {
  const slugs = await getAllCollectionSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return {};

  return {
    // seo_title/seo_description are unpopulated in today's seed (data/catalog.json carries no SEO
    // copy) — fall back to the collection's own real title/tagline rather than rendering nothing.
    // Bare title only: the root layout's title template ("%s — Dishu Masala") appends the brand
    // suffix once — appending it here too produced "Blue Tea — Dishu Masala — Dishu Masala".
    title: collection.seoTitle ?? collection.title,
    description:
      collection.seoDescription ??
      collection.tagline ??
      `Shop ${collection.title} at Dishu Masala — organic, GST-inclusive pricing, free shipping over ₹500.`,
    alternates: { canonical: `/collections/${collection.slug}/` },
  };
}

/** Blue Tea and Red Tea headers use the Lemon Shift/hibiscus gradient tile treatment (CLAUDE.md
 * §5.4: "Blue Tea and Red Tea collection tiles" is one of the explicitly allowed gradient
 * placements) — one gradient surface for the whole viewport, same cap the homepage bands respect.
 * The other three collections get an ivory header with their own family-accent rule instead. */
function CollectionHeader({
  title,
  tagline,
  slug,
  belowBanner = false,
}: {
  title: string;
  tagline: string | null;
  slug: string;
  /**
   * True when a page banner sits directly above this header (2026-09-17, after the client moved
   * collection banners back to the top of the page).
   *
   * The banner is the page's hero: the client's own artwork already carries a headline, the logo
   * and the trust icons baked into the pixels. A second full-height colour block immediately under
   * it reads as two competing heroes stacked, which is the opposite of the restraint the reference
   * site is admired for. So when a banner is present this header collapses to a compact title bar
   * on the page's own ivory ground — accent rule, eyebrow, name and tagline — and the saturated
   * gradient treatment is dropped. With no banner, the full treatment below still runs, because
   * then this header IS the page's only hero and does need the presence.
   */
  belowBanner?: boolean;
}) {
  const isGradient = GRADIENT_TILE_SLUGS.has(slug) && !belowBanner;
  if (isGradient) {
    const gradient = slug === "blue-tea" ? "var(--gradient-brew-cool)" : "var(--gradient-hibiscus)";
    return (
      <header className="w-full" style={{ backgroundImage: gradient }}>
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">Collection</p>
          <h1
            className="mt-3 font-display font-semibold text-white"
            style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {title}
          </h1>
          {tagline && <p className="mt-3 max-w-xl text-base leading-relaxed text-white/90">{tagline}</p>}
        </div>
      </header>
    );
  }

  const accent = familyAccentVar(resolveFamilyAccent(slug, []));
  return (
    <header className="w-full bg-bg">
      {/* Tighter vertical rhythm under a banner — the banner has already claimed the top of the
       * page, so this block is a caption to it, not a hero of its own. */}
      <div
        className={
          belowBanner
            ? "mx-auto max-w-7xl px-4 pb-2 pt-6 sm:px-6 sm:pt-8"
            : "mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-16"
        }
      >
        <div
          aria-hidden="true"
          className={`h-[3px] w-16 rounded-full ${belowBanner ? "mb-4" : "mb-6"}`}
          style={{ backgroundColor: accent }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
          Collection
        </p>
        <h1
          className="mt-3 font-display font-semibold text-ink"
          style={{
            fontSize: belowBanner ? "clamp(1.75rem, 3vw, 2.5rem)" : "clamp(2rem, 4vw, 3.25rem)",
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        {tagline && <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2">{tagline}</p>}
      </div>
    </header>
  );
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const products = await getPublishedProductsByCollectionSlug(slug);
  const suppliedHero = CATEGORY_BANNER_ASSETS[collection.slug];

  return (
    <div>
      {/* The collection main banner is always the supplied CategoryBanners asset, unchanged. A
       * collection with no supplied art gets no substitute Supabase promotion in this position. */}
      {suppliedHero ? (
        <CollectionHero title={collection.title} asset={suppliedHero} />
      ) : null}

      {/* Benefit strip, directly under the banner (client bug list row 3, 2026-09-17: "location
       * below the category banners of blue tea , red tea"). Reuses the shared MarqueeStrip rather
       * than a second scrolling implementation, so it pauses on hover and freezes to a static list
       * under prefers-reduced-motion for free. Deliberately gated by collection — see
       * content/collection-benefits.ts for why "Zero Caffeine" must never reach Classic & Assam. */}
      {COLLECTIONS_WITH_BENEFIT_STRIP.has(collection.slug) && (
        <MarqueeStrip
          ariaLabel={`${collection.title} product qualities`}
          items={TEA_BENEFIT_STRIP.map((b) => ({ label: b.label }))}
        />
      )}

      {!suppliedHero && (
        <CollectionHeader
          title={collection.title}
          tagline={collection.tagline}
          slug={collection.slug}
        />
      )}

      <section aria-labelledby="collection-products-heading" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
        {suppliedHero && (
          <div className="mb-7 flex items-end justify-between gap-4 sm:mb-9">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Shop the collection</p>
              <h2 id="collection-products-heading" className="mt-2 font-display text-2xl font-semibold tracking-[-0.015em] text-ink sm:text-3xl">
                {collection.title}
              </h2>
            </div>
            <p className="shrink-0 text-sm text-ink-2">{products.length} products</p>
          </div>
        )}
        {products.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-2 px-6 py-16 text-center text-ink-2">
            No products are published in this collection yet.
          </p>
        ) : (
          <ProductGrid products={products} />
        )}
      </section>

      <CollectionFaq collectionSlug={collection.slug} collectionTitle={collection.title} />
    </div>
  );
}
