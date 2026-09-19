import type { StaticImageData } from "next/image";
import blueTeaDesktop from "@/data/CategoryBanners/BannerBlueTeaWeb.png";
import blueTeaMobile from "@/data/CategoryBanners/BannerBlueTeaMobile.png";
import redTeaDesktop from "@/data/CategoryBanners/BannerRedTeaWeb.png";
import redTeaMobile from "@/data/CategoryBanners/BannerRedTeaMobile.png";
import blackTeaDesktop from "@/data/CategoryBanners/BannerBlackTeaWeb.png";
import blackTeaMobile from "@/data/CategoryBanners/BannerBlackTeaMobile.png";
import spicesDesktop from "@/data/CategoryBanners/BannerSpiceComboWeb.png";
import spicesMobile from "@/data/CategoryBanners/BannerSpicesComboMobile.png";

/**
 * The exact client-supplied category art. The Spice Combo creative is intentionally shared by
 * the Spices and Spice Combos pages: it is the only supplied hero that represents the masala
 * range, and is rendered unchanged in both places rather than manufacturing a second banner.
 */
export interface CategoryBannerAsset {
  desktop: StaticImageData;
  mobile?: StaticImageData;
  alt: string;
}

const SPICES: CategoryBannerAsset = {
  desktop: spicesDesktop,
  mobile: spicesMobile,
  alt: "Dishu Masala spice range",
};

export const CATEGORY_BANNER_ASSETS: Partial<Record<string, CategoryBannerAsset>> = {
  "blue-tea": {
    desktop: blueTeaDesktop,
    mobile: blueTeaMobile,
    alt: "Dishu Masala Premium Herbal Blue Tea",
  },
  "red-tea": {
    desktop: redTeaDesktop,
    mobile: redTeaMobile,
    alt: "Dishu Masala Premium Herbal Red Tea",
  },
  "classic-teas": {
    desktop: blackTeaDesktop,
    mobile: blackTeaMobile,
    alt: "Dishu Masala Black Tea range",
  },
  spices: SPICES,
  combos: SPICES,
};
