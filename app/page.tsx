import { getCollectionsWithStats } from "@/lib/db/queries/collections";
import { getHomepageReviewsPage } from "@/lib/db/queries/reviews";
import { getPublishedProductsByCollectionSlug } from "@/lib/db/queries/products";
import {
  getHomepageBanners,
  getRedTeaSectionBanner,
  getRedTeaLifestyleImage,
  getSpicesSectionBanner,
  getClassicTeaSectionBanner,
  getCategoryCircleImages,
} from "@/lib/db/queries/settings";
import { PromoBannerSlider } from "@/components/hero/PromoBannerSlider";
import { TrustStrip } from "@/components/layout/TrustStrip";
import { CategoryCircles, type CategoryCircleItem } from "@/components/sections/CategoryCircles";
import { MarqueeStrip } from "@/components/layout/MarqueeStrip";
import { HOME_BENEFIT_STRIP } from "@/content/collection-benefits";
import { FounderStory } from "@/components/sections/FounderStory";
import { BlueTeaBand } from "@/components/sections/BlueTeaBand";
import { RedTeaSection } from "@/components/sections/RedTeaSection";
import { ScrollColorBand } from "@/components/sections/ScrollColorBand";
import { MasalaBand } from "@/components/sections/MasalaBand";
import { ComboValue } from "@/components/sections/ComboValue";
import { BlackTeaStrip } from "@/components/sections/BlackTeaStrip";
import { RitualTeaser } from "@/components/sections/RitualTeaser";
import { ReviewsEmptyState } from "@/components/sections/ReviewsEmptyState";
import { HomepageReviews } from "@/components/sections/HomepageReviews";
import { CollectionFaq } from "@/components/sections/CollectionFaq";

/**
 * The homepage (Phase 2 / PROMPTS.md, replacing Phase 0's plain-text DB proof page).
 *
 * **The very first thing on the page is `CategoryCircles`** (client reference: zoffchef.com), a
 * round-photo quick-nav strip across all 5 real collections — pure navigation, distinct from
 * `PromoBannerSlider` right below it, which is marketing (client-supplied banner imagery/offers).
 * See CategoryCircles.tsx.
 *
 * **Section order (CLAUDE.md §7.2, amended 2026-09-10): two co-equal pillars, Tea and Masala,
 * alternating — not the original single tea-first-then-everything-else cascade.** Each pillar gets
 * its own full-bleed primary band, in priority order: Tea's (Blue Tea + Red Tea, still the strongest individual hook — the
 * Lemon Shift — so it still leads) immediately followed by Masala's (Spices), not five sections of
 * tea before a single spice appears. Each pillar's secondary section (Black Tea for Tea,
 * Combo Packs for Masala) follows the same way. `collections.priority` itself was renumbered to
 * match this interleaving (data/catalog.json: blue-tea=1, spices=2, red-tea=3, combos=4,
 * classic-teas=5), so `/shop`'s default sort and the footer collection list — which read raw
 * `priority` rather than this file's template — now interleave the same way without needing their
 * own template logic.
 *
 * Products come first (2026-09-20, bluetea.co.in's order): hero banner, benefit strip, then straight
 * into the pillar bands. The founder story is a short "Our story" block after the products, with the
 * full text on /about — it used to run in full before the first product, which put the first
 * buyable card about three and a half phone screens down. No section fades in on scroll any more:
 * one signature motion (the colour bands) reads as deliberate; a fade on every section read as
 * decoration and made content arrive late.
 *
 * See components/sections/MasalaBand.tsx for why its ScrollColorBand uses chilli → pepper, not
 * turmeric (a real accessibility reason, not a style preference), and CLAUDE.md §5.4's matching
 * amendment for why a second full-bleed band is no longer a §5.4 violation now that Tea and Masala
 * are deliberately symmetric, not "one exception plus everything else."
 *
 * Every product/collection value below is read from Postgres via lib/db/queries/* — nothing in this
 * file or components/sections/* hardcodes a name, price or image URL.
 */
export default async function Home() {
  const [
    collections,
    blueTea,
    redTea,
    combos,
    spices,
    blackTea,
    teaCombos,
    banners,
    redTeaBanner,
    redTeaLifestyle,
    spicesBanner,
    classicTeaBanner,
    categoryCircleImages,
    homepageReviewsPage,
  ] = await Promise.all([
    getCollectionsWithStats(),
    getPublishedProductsByCollectionSlug("blue-tea"),
    getPublishedProductsByCollectionSlug("red-tea"),
    getPublishedProductsByCollectionSlug("combos"),
    getPublishedProductsByCollectionSlug("spices"),
    getPublishedProductsByCollectionSlug("classic-teas"),
    getPublishedProductsByCollectionSlug("tea-combos"),
    getHomepageBanners(),
    getRedTeaSectionBanner(),
    getRedTeaLifestyleImage(),
    getSpicesSectionBanner(),
    getClassicTeaSectionBanner(),
    getCategoryCircleImages(),
    getHomepageReviewsPage(),
  ]);

  // This file's fixed section order encodes two invariants CLAUDE.md §7.2 (amended) states in
  // words — verify both against the live DB priority values on every render rather than silently
  // trusting them forever (an admin edit could break either one): Blue Tea still leads Red Tea, and
  // Masala's primary band (Spices) sits between them — right after Tea's lead hook, not behind the
  // rest of the tea range.
  const priorityOf = (slug: string) => collections.find((c) => c.slug === slug)?.priority;
  const blueTeaPriority = priorityOf("blue-tea");
  const redTeaPriority = priorityOf("red-tea");
  const spicesPriority = priorityOf("spices");
  if (blueTeaPriority == null || redTeaPriority == null || !(blueTeaPriority < redTeaPriority)) {
    console.warn(
      "app/page.tsx: collections.priority no longer puts Blue Tea before Red Tea — the homepage's " +
        "fixed section order (CLAUDE.md §7.2) needs re-checking against the current DB values.",
    );
  }
  if (
    blueTeaPriority == null ||
    redTeaPriority == null ||
    spicesPriority == null ||
    !(blueTeaPriority < spicesPriority && spicesPriority < redTeaPriority)
  ) {
    console.warn(
      "app/page.tsx: collections.priority no longer puts Spices between Blue Tea and Red Tea — the " +
        "Tea/Masala pillar interleaving (CLAUDE.md §7.2 amendment) needs re-checking against the " +
        "current DB values.",
    );
  }

  /**
   * The circles use the client's studio photos (data/category/, migrated into
   * `settings.category_circle_images` by scripts/migrate-category-circles.ts, keyed by collection
   * slug). If one is ever missing, the circle falls back to that collection's lead product photo
   * rather than an empty disc. Costs nothing: these product lists are already loaded above for the homepage's own sections,
   * so this is a lookup, not a query. The dedicated photo always wins when it exists — this only
   * fills the gap, and the gap closes by itself the moment the real images are migrated.
   */
  const leadImage = (list: typeof blueTea) => list.find((p) => p.images.length > 0)?.images[0] ?? null;
  const collectionTitle = (slug: string) => collections.find((collection) => collection.slug === slug)?.title ?? "Shop";

  // Two rows of three on phones, one row of six from `md`: Tea (Blue, Red, Tea Combos), then
  // Masala (Spices, Spice Combos), then Black Tea.
  const categoryCircleItems: CategoryCircleItem[] = [
    // 1st Row
    {
      slug: "blue-tea",
      title: collectionTitle("blue-tea"),
      href: "/collections/blue-tea/",
      image: categoryCircleImages["blue-tea"] ?? leadImage(blueTea),
    },
    {
      slug: "red-tea",
      title: collectionTitle("red-tea"),
      href: "/collections/red-tea/",
      image: categoryCircleImages["red-tea"] ?? leadImage(redTea),
    },
    {
      slug: "tea-combos",
      title: collectionTitle("tea-combos"),
      href: "/collections/tea-combos/",
      image: categoryCircleImages["tea-combos"] ?? leadImage(teaCombos) ?? leadImage(blueTea),
    },
    // 2nd Row
    {
      slug: "spices",
      title: collectionTitle("spices"),
      href: "/collections/spices/",
      image: categoryCircleImages["spices"] ?? leadImage(spices),
    },
    {
      slug: "combos",
      title: collectionTitle("combos"),
      href: "/collections/combos/",
      image: categoryCircleImages["combos"] ?? leadImage(combos),
    },
    {
      slug: "classic-teas",
      title: collectionTitle("classic-teas"),
      href: "/collections/classic-teas/",
      image: categoryCircleImages["classic-teas"] ?? leadImage(blackTea),
    },
  ];

  return (
    <>
      <TrustStrip />
      <CategoryCircles items={categoryCircleItems} />
      <PromoBannerSlider banners={banners} fullBleed />
      <MarqueeStrip ariaLabel="Why Dishu" items={HOME_BENEFIT_STRIP.map((b) => ({ label: b.label }))} />
      <ScrollColorBand fromVar="--color-brew-2" viaVar="--color-brew-5" toVar="--color-hibiscus" className="w-full">
        <BlueTeaBand products={blueTea} />
        <RedTeaSection products={redTea} lifestyleImage={redTeaLifestyle} />
      </ScrollColorBand>
      {/* The two banners are the cream breather between the Red Tea and Masala bands — two
          saturated bands back to back collapse into one long dark stretch. No wrapper around them:
          the slider's own section padding is the spacing (a padded wrapper on top of it doubled the
          gap to 88px each side). The Masala band that follows carries the heading, so the spices
          banner has no "Spices" title of its own. */}
      <PromoBannerSlider banners={redTeaBanner} ariaLabel="Red Tea promotion" />
      <PromoBannerSlider banners={spicesBanner} ariaLabel="Spices promotion" />
      <ScrollColorBand fromVar="--color-chilli" toVar="--color-pepper" className="w-full">
        <MasalaBand products={spices} />
      </ScrollColorBand>
      <PromoBannerSlider banners={classicTeaBanner} ariaLabel="Black Tea promotion" />
      <BlackTeaStrip products={blackTea} />
      <ComboValue combos={combos} spices={spices} />
      <RitualTeaser />
      <FounderStory />
      {homepageReviewsPage.items.length > 0 ? (
        <HomepageReviews
          initialPage={{
            ...homepageReviewsPage,
            items: homepageReviewsPage.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt).toISOString() })),
          }}
        />
      ) : (
        <ReviewsEmptyState />
      )}
      <CollectionFaq collectionSlug="general" collectionTitle="Dishu Masala" />
    </>
  );
}
