/**
 * Client-supplied product videos. These are deliberately a small, explicit map rather than a
 * filename convention: a product can only show footage that genuinely belongs to it, and a
 * missing entry means the PDP remains an image-only gallery.
 */
export interface ProductVideo {
  url: string;
  alt: string;
  width: number;
  height: number;
}

const VIDEO_ROOT = "/product-videos";

const BLUE_TEA: ProductVideo = {
  url: `${VIDEO_ROOT}/BlueTea.mp4`,
  alt: "Premium Herbal Blue Tea preparation video",
  width: 720,
  height: 1280,
};

const BLUE_TEA_LOOSE: ProductVideo = {
  url: `${VIDEO_ROOT}/BlueTeaLoose.mp4`,
  alt: "Premium Herbal Blue Tea (loose) preparation video",
  width: 720,
  height: 1280,
};

const RED_TEA: ProductVideo = {
  url: `${VIDEO_ROOT}/RedTea.mp4`,
  alt: "Premium Herbal Red Tea preparation video",
  width: 720,
  height: 1280,
};

const RED_TEA_LOOSE: ProductVideo = {
  url: `${VIDEO_ROOT}/RedTeaLoose.mp4`,
  alt: "Premium Herbal Red Tea (loose) preparation video",
  width: 720,
  height: 1280,
};

const PRODUCT_VIDEOS: Record<string, ProductVideo> = {
  "premium-herbal-blue-tea-teabags": BLUE_TEA,
  "premium-herbal-blue-tea-loose": BLUE_TEA_LOOSE,
  "premium-herbal-red-tea-teabags": RED_TEA,
  "premium-herbal-red-tea-loose": RED_TEA_LOOSE,
  "black-pepper-powder": {
    url: `${VIDEO_ROOT}/BlackPepper.mp4`,
    alt: "Black Pepper Powder product video",
    width: 720,
    height: 1280,
  },
  "garam-masala-powder": {
    url: `${VIDEO_ROOT}/GaramMasala.mp4`,
    alt: "Garam Masala Powder product video",
    width: 720,
    height: 1280,
  },
  "turmeric-powder-haldi-powder": {
    url: `${VIDEO_ROOT}/TurmericPower.mp4`,
    alt: "Turmeric Powder product video",
    width: 720,
    height: 1280,
  },
  "red-chilli-powder": {
    url: `${VIDEO_ROOT}/RedChili.mp4`,
    alt: "Red Chilli Powder product video",
    width: 720,
    height: 1280,
  },
  "coriander-powder": {
    url: `${VIDEO_ROOT}/CorrianderPowder.mp4`,
    alt: "Coriander Powder product video",
    width: 720,
    height: 1280,
  },
};

export function getProductVideo(productSlug: string): ProductVideo | null {
  return PRODUCT_VIDEOS[productSlug] ?? null;
}
