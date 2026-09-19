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
import { TeaBenefitsMarquee } from "@/components/sections/TeaBenefitsMarquee";
import { FounderStory } from "@/components/sections/FounderStory";
import { BlueTeaBand } from "@/components/sections/BlueTeaBand";
import { RedTeaSection } from "@/components/sections/RedTeaSection";
import { ScrollColorBand } from "@/components/sections/ScrollColorBand";
import { SpicesBanner } from "@/components/sections/SpicesBanner";
import { MasalaBand } from "@/components/sections/MasalaBand";
import { ComboValue } from "@/components/sections/ComboValue";
import { ClassicAssamStrip } from "@/components/sections/ClassicAssamStrip";
import { RitualTeaser } from "@/components/sections/RitualTeaser";
import { ReviewsEmptyState } from "@/components/sections/ReviewsEmptyState";
import { HomepageReviews } from "@/components/sections/HomepageReviews";
import { CollectionFaq } from "@/components/sections/CollectionFaq";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

/**
 * The homepage (Phase 2 / PROMPTS.md, replacing Phase 0's plain-text DB proof page).
 *
 * **The very first thing on the page is `CategoryCircles`** (client reference: zoffchef.com), a
 * round-photo quick-nav strip across all 5 real collections — pure navigation, distinct from
 * `PromoBannerSlider` right below it, which is marketing (client-supplied banner imagery/offers).
 * See CategoryCircles.tsx.
 *
 * **Section order (CLAUDE.md §7.2, amended 2026-09-10): two co-equal pillars, Tea and Masala,
 * alternating — not the original single tea-first-then-everything-else cascade.** Trust strip and
 * founder story lead (facts, then the person), then each pillar gets its own full-bleed primary
 * band, in priority order: Tea's (Blue Tea + Red Tea, still the strongest individual hook — the
 * Lemon Shift — so it still leads) immediately followed by Masala's (Spices), not five sections of
 * tea before a single spice appears. Each pillar's secondary section (Classic & Assam for Tea,
 * Combo Packs for Masala) follows the same way. `collections.priority` itself was renumbered to
 * match this interleaving (data/catalog.json: blue-tea=1, spices=2, red-tea=3, combos=4,
 * classic-teas=5), so `/shop`'s default sort and the footer collection list — which read raw
 * `priority` rather than this file's template — now interleave the same way without needing their
 * own template logic.
 *
 * FounderStory sits right after TrustStrip, before either pillar's band: the homepage's two trust
 * devices back to back — verifiable facts first, then the person behind them — before any product
 * ask. See components/sections/FounderStory.tsx for why it ships with no photo.
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
    classicAssam,
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
   * Falls back to a collection's own lead product photo when no dedicated circle image has been
   * migrated for it (added 2026-09-17 — every circle was rendering an empty grey disc, because
   * `settings.category_circle_images` is absent until scripts/migrate-category-circles.ts runs and
   * that script's source photos are not in the repo).
   *
   * Costs nothing: these product lists are already loaded above for the homepage's own sections,
   * so this is a lookup, not a query. The dedicated photo always wins when it exists — this only
   * fills the gap, and the gap closes by itself the moment the real images are migrated.
   */
  const leadImage = (list: typeof blueTea) => list.find((p) => p.images.length > 0)?.images[0] ?? null;
  // Collection names come from Supabase with one intentional display alias requested by the
  // client. The arrangement below is UI navigation, but it never hardcodes catalogue titles.
  const displayCollectionTitle = (slug: string) => {
    if (slug === "classic-teas") return "Black Tea";
    return collections.find((collection) => collection.slug === slug)?.title ?? "Shop";
  };

  // Category circles grid arranged in 2 rows of 3:
  // 1st Row: Blue Tea, Red Tea, Blue tea-Red Tea Combo
  // 2nd Row: Spices, Spices Combo, Black Tea
  const categoryCircleItems: CategoryCircleItem[] = [
    // 1st Row
    {
      slug: "blue-tea",
      title: displayCollectionTitle("blue-tea"),
      href: "/collections/blue-tea/",
      image: categoryCircleImages["blue-tea"] ?? leadImage(blueTea),
    },
    {
      slug: "red-tea",
      title: displayCollectionTitle("red-tea"),
      href: "/collections/red-tea/",
      image: categoryCircleImages["red-tea"] ?? leadImage(redTea),
    },
    {
      slug: "blue-tea-red-tea-combo",
      title: displayCollectionTitle("tea-combos"),
      // Repointed 2026-09-17: this circle used to land on /collections/combos/, which now holds
      // only the spice sets. The Blue/Red tea pairs live in their own `tea-combos` collection.
      href: "/collections/tea-combos/",
      image: categoryCircleImages["blue-tea-red-tea-combo"] ?? categoryCircleImages["combos"] ?? leadImage(teaCombos) ?? leadImage(blueTea),
    },
    // 2nd Row
    {
      slug: "spices",
      title: displayCollectionTitle("spices"),
      href: "/collections/spices/",
      image: categoryCircleImages["spices"] ?? leadImage(spices),
    },
    {
      slug: "combos",
      title: displayCollectionTitle("combos"),
      href: "/collections/combos/",
      // Its own dedicated photo (client-supplied combo pack-lineup shot), not the shared
      // "combos" gift-box image the Blue Tea–Red Tea circle above also falls back to — those two
      // circles used to show the same picture before this key existed.
      image: categoryCircleImages["spices-combo"] ?? categoryCircleImages["combos"] ?? leadImage(combos),
    },
    {
      slug: "classic-teas",
      // Renamed from "Assam Tea" on the client's written bug list (2026-09-17): "Change Assam Tea
      // Category to Black Tea Name". The collection itself is still `classic-teas` and its DB title
      // is unchanged — this is the circle's display label only, which is what the client was
      // looking at. Both products behind it (Classic Tea, Premium Assam Tea) are black teas, so the
      // broader name is also the more accurate one for the category.
      title: displayCollectionTitle("classic-teas"),
      href: "/collections/classic-teas/",
      image: categoryCircleImages["classic-teas"] ?? leadImage(classicAssam),
    },
  ];

  return (
    <>
      <TrustStrip />
      <CategoryCircles items={categoryCircleItems} />
      <PromoBannerSlider banners={banners} bare />
      <TeaBenefitsMarquee />
      <FounderStory />
      <ScrollColorBand fromVar="--color-brew-2" viaVar="--color-brew-5" toVar="--color-hibiscus" className="w-full">
        <BlueTeaBand products={blueTea} />
        <RedTeaSection products={redTea} lifestyleImage={redTeaLifestyle} />
      </ScrollColorBand>
      {/* Cream breather between Red Tea and Spices (design-review: two saturated maroons landing
          back-to-back collapsed the colour journey into one long dark stretch instead of two
          distinct beats — this is the one gap the journey was missing). `py-10 sm:py-14` on top of
          PromoBannerSlider/SpicesBanner's own internal padding gives real air before the next
          saturated hit, without changing either component's own reusable padding. */}
      <div className="bg-bg py-10 sm:py-14">
        <ScrollReveal>
          <PromoBannerSlider banners={redTeaBanner} ariaLabel="Red Tea promotion" />
        </ScrollReveal>

        <ScrollReveal>
          <SpicesBanner banner={spicesBanner} />
        </ScrollReveal>
      </div>
      <ScrollColorBand fromVar="--color-chilli" toVar="--color-pepper" className="w-full">
        <MasalaBand products={spices} />
      </ScrollColorBand>

      <ScrollReveal>
        <PromoBannerSlider banners={classicTeaBanner} ariaLabel="Classic & Assam promotion" />
      </ScrollReveal>
      <ScrollReveal>
        <ClassicAssamStrip products={classicAssam} />
      </ScrollReveal>
      <ScrollReveal>
        <ComboValue combos={combos} spices={spices} />
      </ScrollReveal>
      <ScrollReveal>
        <RitualTeaser />
      </ScrollReveal>
      {/* Real approved reviews when any exist, the dignified empty state until then (client bug
       * list row 13, 2026-09-17: "Add Reviews"). The swap is automatic — nothing here needs
       * touching the first time a genuine review is approved. There are zero approved reviews
       * today, so this still renders the empty state; see getHomepageReviews() for why that is
       * correct rather than a bug, and CLAUDE.md §8 for why none were invented to fill it. */}
      <ScrollReveal>
        {homepageReviewsPage.items.length > 0 ? (
          <HomepageReviews
            initialPage={{
              ...homepageReviewsPage,
              items: homepageReviewsPage.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt).toISOString() })),
            }}
          />
        ) : <ReviewsEmptyState />}
      </ScrollReveal>
      <ScrollReveal>
        <CollectionFaq collectionSlug="general" collectionTitle="Dishu Masala" />
      </ScrollReveal>
      {/* NewsletterSection removed from the homepage 2026-09-17 on the client's written bug list
       * ("Delete the subsctibe now part"). The component and its `newsletter_subs` capture path are
       * deliberately left in place — the footer still collects signups, so this drops the
       * full-width homepage block without losing the list itself. */}
    </>
  );
}
