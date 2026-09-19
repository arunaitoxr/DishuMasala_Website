import Image from "next/image";
import type { CategoryBannerAsset } from "@/content/category-banners";

/**
 * Supplied collection-banner artwork, rendered as-is at its intrinsic aspect ratio. This component
 * intentionally adds no title, colour band, overlay, crop, or fallback asset: all main-banner
 * visual content must come from data/CategoryBanners.
 */
export function CollectionHero({
  title,
  asset,
}: {
  title: string;
  asset: CategoryBannerAsset;
}) {
  const mobileAsset = asset.mobile ?? asset.desktop;

  return (
    <section aria-label={`${title} collection`} className="w-full">
      <h1 className="sr-only">{title}</h1>
      <div className="hidden w-full lg:block">
        <Image
          src={asset.desktop}
          alt={asset.alt}
          priority
          sizes="100vw"
          className="h-auto w-full object-contain"
        />
      </div>

      <div className="lg:hidden">
        <Image src={mobileAsset} alt={asset.alt} priority sizes="100vw" className="h-auto w-full object-contain" />
      </div>
    </section>
  );
}
