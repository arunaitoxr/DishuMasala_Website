import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllPublishedProductSlugs,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/db/queries/product-detail";
import { getReviewSummary, getApprovedReviews } from "@/lib/db/queries/reviews";
import { getFreeShippingThresholdPaise } from "@/lib/db/queries/settings";
import { getCollectionsWithStats } from "@/lib/db/queries/collections";
import { TEA_COLLECTION_SLUGS, MASALA_COLLECTION_SLUGS } from "@/lib/nav";
import { Gallery, type GallerySlide } from "@/components/pdp/Gallery";
import { PdpInteractive } from "@/components/pdp/PdpInteractive";
import { PincodeCheck } from "@/components/pdp/PincodeCheck";
import { Details } from "@/components/pdp/Details";
import { BrewStory } from "@/components/pdp/BrewStory";
import { Reviews } from "@/components/pdp/Reviews";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { CollectionFaq } from "@/components/sections/CollectionFaq";
import { SetWhatsAppOrderMessage } from "@/components/marketing/SetWhatsAppOrderMessage";
import { formatINR } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";
import { getProductVideo } from "@/content/product-videos";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/** Every published product's slug, known at build time — same "published" status filter Phase 3
 * established for /shop and /collections/[slug] (CLAUDE.md §3.1's fixed catalogue shape). */
export async function generateStaticParams() {
  const slugs = await getAllPublishedProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const primaryVariant = product.variants[0];
  const description =
    product.seoDescription ??
    product.shortDescription?.split("\n")[0] ??
    `${product.name} — organic, GST-inclusive pricing, free shipping over ₹500, from Dishu Masala.`;

  return {
    title: product.seoTitle ?? `${product.name}${primaryVariant ? ` — ${formatINR(primaryVariant.pricePaise)}` : ""}`,
    description,
    // Keeps the legacy URL shape exactly: /product/<slug>/ (CLAUDE.md §10's SEO/migration rule).
    alternates: { canonical: `/product/${product.slug}/` },
  };
}

function safeImageUrl(storageKey: string): string | null {
  try {
    return publicUrl(storageKey);
  } catch {
    return null;
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [collections, freeShippingThresholdPaise, reviewSummary, reviewsFirstPage, related] = await Promise.all([
    getCollectionsWithStats(),
    getFreeShippingThresholdPaise(),
    getReviewSummary(product.id),
    getApprovedReviews(product.id, { sort: "recent", page: 1 }),
    getRelatedProducts(product.id, 4),
  ]);
  const collection = collections.find((c) => c.id === product.collectionId) ?? null;

  const isBlueTea = collection?.slug === "blue-tea";
  const primaryVariant = product.variants[0];

  // Cross-pillar nudge (CLAUDE.md §7.2's 2026-09-10 amendment: Tea and Masala are co-equal
  // pillars): a Tea product points at Masala's own strongest hook (spices), a Masala product
  // points at Tea's (blue-tea) — reusing lib/nav.ts's pillar sets rather than inventing a second
  // classification. `null` for a product in neither set (there isn't one today, but this degrades
  // to "no nudge" rather than guessing).
  const otherPillarSlug = collection && TEA_COLLECTION_SLUGS.has(collection.slug)
    ? "spices"
    : collection && MASALA_COLLECTION_SLUGS.has(collection.slug)
      ? "blue-tea"
      : null;
  const otherPillarCollection = otherPillarSlug ? collections.find((c) => c.slug === otherPillarSlug) ?? null : null;

  const slides: GallerySlide[] = product.images.flatMap((img) => {
      const url = safeImageUrl(img.storageKey);
      return url ? [{ kind: "image" as const, url, alt: img.alt, width: img.width, height: img.height }] : [];
    });
  const productVideo = getProductVideo(product.slug);
  if (productVideo) slides.push({ kind: "video", ...productVideo });

  const primaryImageKey = product.images.find((img) => img.isPrimary)?.storageKey ?? product.images[0]?.storageKey;
  const primaryImageUrl = primaryImageKey ? safeImageUrl(primaryImageKey) : null;

  const hasApprovedReviews = reviewSummary.count > 0;

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: primaryVariant?.sku,
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      priceCurrency: "INR",
      price: (v.pricePaise / 100).toFixed(2),
      availability: v.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/product/${product.slug}/`,
    })),
  };

  // AggregateRating only when at least one approved review exists (CLAUDE.md §10 / PROMPTS.md
  // Phase 4 item 1) — genuinely omitted, not just conditionally empty, when count is 0.
  if (hasApprovedReviews) {
    productJsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviewSummary.average.toFixed(1),
      reviewCount: reviewSummary.count,
    };
  }

  const breadcrumbItems = [
    { name: "Shop", url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/shop` },
    ...(collection
      ? [{ name: collection.title, url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/collections/${collection.slug}` }]
      : []),
    { name: product.name, url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/product/${product.slug}/` },
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  const reviewsPageForClient = {
    ...reviewsFirstPage,
    items: reviewsFirstPage.items.map((item) => ({
      ...item,
      // `getApprovedReviews` is wrapped in `unstable_cache`, which JSON-serializes its return
      // value — `createdAt` comes back as an ISO string, not a `Date`, on every cache hit (it only
      // looked like a `Date` before because this path had never run against a non-empty review
      // list). Normalize through `new Date(...)` so this works whether the cache handed back a
      // string or a real `Date`.
      createdAt: new Date(item.createdAt).toISOString(),
      photos: item.photos
        .map((p) => {
          const url = safeImageUrl(p.storageKey);
          return url ? { id: p.id, url } : null;
        })
        .filter((p): p is { id: number; url: string } => p != null),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Removed 2026-09-17 on the client's written bug list: "butterfly animation was needed
       * before this page not here, remove it" — the falling-flower overlay belongs on the Blue Tea
       * collection entrance, not the product page. It was also failing on its own terms here: the
       * source art is a 638x841 detailed flower drawn at 14-28px and 40-70% opacity, which read as
       * grey smudges sitting over the product title, the stock line and the pincode field rather
       * than as petals. Both overlays are kept as components for reuse on the collection page. */}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-2">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/shop" className="hover:text-ink hover:underline">
              Shop
            </Link>
          </li>
          {collection && (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={`/collections/${collection.slug}`} className="hover:text-ink hover:underline">
                  {collection.title}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {product.name}
          </li>
        </ol>
      </nav>

      <SetWhatsAppOrderMessage productName={product.name} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-20">
        <Gallery productName={product.name} slides={slides} />

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <PdpInteractive
            productId={product.id}
            productName={product.name}
            optionLabel={product.optionLabel}
            variants={product.variants}
            priority={product.priority}
            primaryImageUrl={primaryImageUrl}
            reviewCount={reviewSummary.count}
            reviewAverage={reviewSummary.average}
            freeShippingThresholdPaise={freeShippingThresholdPaise}
          />

          <PincodeCheck />

          <Details
            description={product.description}
            freeShippingThresholdPaise={freeShippingThresholdPaise}
            // Blue Tea's collection has exactly these two products (loose + teabags) — the two
            // slugs the client explicitly confirmed this Wellness Benefits copy for (see
            // Details.tsx / lib/pdp/parse-description.ts). No other collection gets this on.
            showHealthBenefits={isBlueTea}
          />
        </div>
      </div>

      {isBlueTea && (
        <div className="mt-16 border-t border-line pt-12">
          <BrewStory />
        </div>
      )}

      <div className="mt-16 border-t border-line pt-12">
        <Reviews
          productSlug={product.slug}
          productName={product.name}
          summary={reviewSummary}
          initialPage={reviewsPageForClient}
        />
      </div>

      {related.length > 0 && (
        <div className="mt-16 border-t border-line pt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">You may also like</h2>
            {otherPillarCollection && (
              <Link
                href={`/collections/${otherPillarCollection.slug}`}
                className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                Explore {otherPillarCollection.title} →
              </Link>
            )}
          </div>
          <div className="mt-6">
            <ProductGrid products={related} />
          </div>
        </div>
      )}

      </div>

      {collection && (
        <div className="border-t border-line">
          <CollectionFaq collectionSlug={collection.slug} collectionTitle={product.name} />
        </div>
      )}
    </>
  );
}
