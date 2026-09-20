import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { CollectionFaq } from "@/components/sections/CollectionFaq";
import { HeroFloraOverlay, hasHeroFlora } from "@/components/sections/HeroFloraOverlay";
import { PageHero } from "@/components/sections/PageHero";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { TrustBand } from "@/components/sections/TrustBand";
import { MarqueeStrip } from "@/components/layout/MarqueeStrip";
import { COLLECTIONS_WITH_BENEFIT_STRIP, TEA_BENEFIT_STRIP } from "@/content/collection-benefits";
import { COLLECTION_PAGE_COPY, DEFAULT_COLLECTION_PAGE_COPY } from "@/content/collection-pages";
import { CATEGORY_BANNER_ASSETS } from "@/content/category-banners";
import { getAllCollectionSlugs, getCollectionBySlug } from "@/lib/db/queries/collections";
import { getPublishedProductsByCollectionSlug } from "@/lib/db/queries/products";
import { getFreeGiftThresholdPaise, getFreeShippingThresholdPaise } from "@/lib/db/queries/settings";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

/** Every collection slug, known at build time — statically generates each `/collections/<slug>/`. */
export async function generateStaticParams() {
  const slugs = await getAllCollectionSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return {};

  return {
    // Bare title only: the root layout's template appends "— Dishu Masala" once.
    title: collection.seoTitle ?? collection.title,
    description:
      collection.seoDescription ??
      collection.tagline ??
      `Shop ${collection.title} at Dishu Masala — GST-inclusive pricing and free shipping on eligible orders.`,
    alternates: { canonical: `/collections/${collection.slug}/` },
  };
}

/**
 * A collection page, built on the Corporate Gifting page's structure (client brief, 2026-09-20) so
 * the two page types read as one site:
 *
 *   hero (shared PageHero) → benefit strip (herbal teas only) → products under a heading and intro
 *   → trust band → FAQ on one white card.
 *
 * The hero puts the collection's title, tagline and a "Shop" button in the supplied banner's open
 * left side; on phones the banner is followed by a band in the collection's own colour. A collection
 * with no supplied banner gets that band as its whole hero, so no page ever falls back to a
 * different layout. No product count or price range (client asked for those to go, 2026-09-17).
 */
export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const [products, freeShippingThresholdPaise, freeGiftThresholdPaise] = await Promise.all([
    getPublishedProductsByCollectionSlug(slug),
    getFreeShippingThresholdPaise(),
    getFreeGiftThresholdPaise(),
  ]);
  const copy = COLLECTION_PAGE_COPY[collection.slug] ?? DEFAULT_COLLECTION_PAGE_COPY;
  const banner = CATEGORY_BANNER_ASSETS[collection.slug];
  const productsId = "collection-products";

  // The same verifiable claims the homepage trust strip and the product page make — never a
  // count, award or certification (CLAUDE.md §8). Thresholds come from settings, not literals.
  const trustBadges = [
    "Double-layer packaging",
    `Free shipping over ${formatINR(freeShippingThresholdPaise)}`,
    ...(freeGiftThresholdPaise != null ? [`Free gift on orders above ${formatINR(freeGiftThresholdPaise)}`] : []),
    "Cash on delivery available",
    "Sourced from the best specified areas",
  ];

  return (
    <div>
      <PageHero
        ariaLabel={`${collection.title} collection`}
        eyebrow={copy.eyebrow}
        heading={collection.title}
        subhead={collection.tagline}
        cta={{ label: `Shop ${collection.title}`, href: `#${productsId}` }}
        image={banner ? { src: banner.desktop, alt: banner.alt, width: banner.desktop.width, height: banner.desktop.height } : null}
        mobileImage={
          banner?.mobile ? { src: banner.mobile, alt: banner.alt, width: banner.mobile.width, height: banner.mobile.height } : null
        }
        tone="light"
        bandClassName={copy.bandClassName}
        bandTone={copy.invertedStripTone ? "cream" : "brand"}
        overlay={hasHeroFlora(collection.slug) ? <HeroFloraOverlay kind={collection.slug} /> : undefined}
      />

      {/* Client bug list row 3 (2026-09-17): benefit strip directly under the herbal-tea banners.
          Gated by collection — "Zero Caffeine" is false for Black Tea (content/collection-benefits.ts). */}
      {COLLECTIONS_WITH_BENEFIT_STRIP.has(collection.slug) && (
        <MarqueeStrip
          ariaLabel={`${collection.title} product qualities`}
          items={TEA_BENEFIT_STRIP.map((b) => ({ label: b.label }))}
          tone={copy.invertedStripTone ?? "cream"}
        />
      )}

      <section id={productsId} aria-labelledby={`${productsId}-heading`} className="scroll-mt-20 bg-bg">
        <div className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
          <SectionHeading
            id={`${productsId}-heading`}
            eyebrow="Shop the collection"
            heading={copy.productsHeading}
            body={copy.productsIntro || undefined}
            accentClassName={copy.accentClassName}
          />
          <div className="mt-10">
            {products.length === 0 ? (
              <p className="rounded-lg border border-line bg-surface-2 px-6 py-16 text-center text-ink-2">
                No products are published in this collection yet.
              </p>
            ) : (
              <ProductGrid products={products} />
            )}
          </div>
        </div>
      </section>

      <TrustBand id="collection-trust-heading" heading="Why shop with Dishu" badges={trustBadges} />

      <CollectionFaq collectionSlug={collection.slug} collectionTitle={collection.title} />
    </div>
  );
}
