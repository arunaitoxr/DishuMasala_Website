import { PageHero } from "@/components/sections/PageHero";
import { GIFTING_HERO } from "@/content/gifting";
import type { SectionImage } from "@/lib/db/queries/settings";

/** Corporate gifting's hero — the shared PageHero (the same hero every collection page uses), with
 * the dark hamper photo and white copy over its dark left third (reference: bluetea.co.in/pages/b2b).
 * The client's own portrait shot is used on phones, falling back to the wide one. */
export function GiftingHero({
  heroImage,
  heroImageMobile,
}: {
  heroImage: SectionImage | null;
  heroImageMobile: SectionImage | null;
}) {
  const toHeroImage = (img: SectionImage | null) =>
    img ? { src: img.url, alt: img.alt, width: img.width, height: img.height } : null;

  return (
    <PageHero
      ariaLabel="Corporate and bulk gifting"
      eyebrow={GIFTING_HERO.eyebrow}
      heading={GIFTING_HERO.heading}
      subhead={GIFTING_HERO.subhead}
      cta={{ label: GIFTING_HERO.ctaLabel, href: "#bulk-enquiry-form" }}
      image={toHeroImage(heroImage)}
      mobileImage={toHeroImage(heroImageMobile)}
      tone="dark"
      bandClassName="bg-brew-1"
    />
  );
}
