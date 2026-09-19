import type { Metadata } from "next";
import { getProductBySlug } from "@/lib/db/queries/product-detail";
import {
  getCorporateGiftingHeroImage,
  getCorporateGiftingHeroMobileImage,
  getGiftPackImages,
  getSupportEmail,
  getWhatsAppNumber,
} from "@/lib/db/queries/settings";
import type { SectionImage } from "@/lib/db/queries/settings";
import { publicUrl } from "@/lib/storage/storage";
import { GiftingHero } from "@/components/gifting/GiftingHero";
import { GiftPackCarousel, type GiftPackCardData } from "@/components/gifting/GiftPackCarousel";
import { TrustBand } from "@/components/sections/TrustBand";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { BulkEnquiryForm } from "@/components/gifting/BulkEnquiryForm";
import { GIFT_PACKS, GIFTING_TRUST_BADGES } from "@/content/gifting";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Corporate & Bulk Gifting — Dishu Masala",
  description:
    "Customisable tea and masala gifting for corporate, festive and bulk orders. Real Dishu products, made to order, shipped pan-India.",
  alternates: { canonical: "/corporate-gifting/" },
};

/** Resolves each curated pack's card photo — the client's own real gift-box photography
 * (`gift_pack_images`, scripts/migrate-gifting-images.ts) when it exists for that pack slug,
 * falling back to a real, published product's packshot (the original per-product resolution) for
 * any pack slug not yet covered there, and finally to `image: null` (GiftPackCarousel's generic
 * placeholder) if neither exists — never a broken image or a silently dropped card. Never a
 * standalone bundle image invented for the page (content/gifting.ts's own doc explains why these
 * packs aren't `products` rows). */
async function resolveGiftPacks(giftPackImages: Record<string, SectionImage>): Promise<GiftPackCardData[]> {
  const packs = await Promise.all(
    GIFT_PACKS.map(async (pack) => {
      const realPackPhoto = giftPackImages[pack.slug];
      if (realPackPhoto) {
        return { slug: pack.slug, name: pack.name, description: pack.description, image: { url: realPackPhoto.url, alt: realPackPhoto.alt } };
      }

      const product = await getProductBySlug(pack.imageProductSlug);
      const primaryImage = product?.images.find((img) => img.isPrimary) ?? product?.images[0];
      const image = primaryImage
        ? (() => {
            try {
              return { url: publicUrl(primaryImage.storageKey), alt: primaryImage.alt };
            } catch {
              return null;
            }
          })()
        : null;
      return { slug: pack.slug, name: pack.name, description: pack.description, image };
    }),
  );
  return packs;
}

export default async function CorporateGiftingPage() {
  const [heroImage, heroImageMobile, whatsappNumber, supportEmail, giftPackImages] = await Promise.all([
    getCorporateGiftingHeroImage(),
    getCorporateGiftingHeroMobileImage(),
    getWhatsAppNumber(),
    getSupportEmail(),
    getGiftPackImages(),
  ]);
  const giftPacks = await resolveGiftPacks(giftPackImages);

  return (
    <div className="motion-safe:scroll-smooth">
      <GiftingHero heroImage={heroImage} heroImageMobile={heroImageMobile} />

      <section aria-labelledby="gift-packs-heading" className="bg-bg">
        <div className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
          <SectionHeading
            id="gift-packs-heading"
            eyebrow="Starter packs"
            heading="A starting point — every pack is customisable"
            body="These aren't fixed SKUs — tell us your occasion, quantity and budget and we'll put together something that fits."
          />
          <div className="mt-10">
            <GiftPackCarousel packs={giftPacks} />
          </div>
        </div>
      </section>

      <TrustBand id="gifting-trust-heading" heading="Why brands choose Dishu" badges={GIFTING_TRUST_BADGES} />

      <section id="bulk-enquiry-form" aria-labelledby="bulk-enquiry-heading" className="scroll-mt-20 bg-bg">
        <div className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
          <SectionHeading
            id="bulk-enquiry-heading"
            heading="Send a bulk enquiry"
            body="Tell us what you need and our team will get back to you with a quote — usually within one business day."
            align="center"
          />
          <div className="mx-auto mt-8 max-w-2xl rounded-lg border border-line bg-surface p-6 shadow-card sm:p-10">
            <BulkEnquiryForm whatsappNumber={whatsappNumber} supportEmail={supportEmail} />
          </div>
        </div>
      </section>
    </div>
  );
}
