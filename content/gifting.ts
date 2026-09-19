/**
 * Copy for the corporate/bulk-gifting page (app/corporate-gifting/page.tsx). This is a lead-capture
 * page, not a storefront listing — the four "starter packs" below are curated bundles for the
 * enquiry conversation, not purchasable SKUs with their own price, so they live here as content
 * rather than as `products`/`variants` rows (CLAUDE.md §6's schema has no "bundle" concept, and
 * inventing one for a page that quotes per-enquiry rather than checking out would be the wrong
 * fix). Each pack's `productSlugs` are real, published product slugs (data/catalog.json) — the page
 * resolves them against the DB for a real name/photo, never a fabricated one (CLAUDE.md §8).
 */

export const GIFTING_HERO = {
  eyebrow: "Corporate & bulk gifting",
  heading: "Gifting that tastes like Punjab, packaged for the occasion.",
  subhead: "Customisable for your brand, occasion or order size.",
  ctaLabel: "Send a bulk enquiry",
};

export const GIFTING_TRUST_BADGES = [
  "Clean-label & No Preservatives",
  "Double-Layer Packaging",
  "Fully Customisable Gifting",
  "Made-to-Order",
  "GST Invoicing",
  "Pan-India Shipping",
];

export const GIFTING_ENQUIRY_TYPES = ["Gifting", "Corporate", "Festive", "Bulk", "Export"] as const;

export interface GiftPack {
  slug: string;
  name: string;
  description: string;
  /** The real product whose photo represents this pack on the card — resolved server-side against
   * the DB, never a standalone image asset invented for the bundle itself. */
  imageProductSlug: string;
  /** Every real product this bundle is built from, by slug — used only to resolve names for the
   * enquiry's pre-filled "about" text, never rendered as a fake multi-price line item. */
  productSlugs: string[];
}

export const GIFT_PACKS: GiftPack[] = [
  {
    slug: "festive-tea-masala-hamper",
    name: "Festive Tea + Masala Hamper",
    description: "Blue Tea, Red Tea and a trio of our clean masalas, gift-boxed for the season.",
    imageProductSlug: "premium-herbal-blue-tea-teabags",
    productSlugs: [
      "premium-herbal-blue-tea-teabags",
      "premium-herbal-red-tea-teabags",
      "turmeric-powder-haldi-powder",
      "garam-masala-powder",
      "coriander-powder",
    ],
  },
  {
    slug: "corporate-wellness-set",
    name: "Corporate Wellness Set",
    description: "Blue Tea and Red Tea, our caffeine-free duo, for a desk that deserves better.",
    imageProductSlug: "premium-herbal-red-tea-teabags",
    productSlugs: ["premium-herbal-blue-tea-teabags", "premium-herbal-red-tea-teabags"],
  },
  {
    slug: "premium-spice-gift-box",
    name: "Premium Spice Gift Box",
    description: "Turmeric, Coriander, Black Pepper, Red Chilli and Garam Masala — the everyday five.",
    imageProductSlug: "turmeric-powder-haldi-powder",
    productSlugs: [
      "turmeric-powder-haldi-powder",
      "coriander-powder",
      "black-pepper-powder",
      "red-chilli-powder",
      "garam-masala-powder",
    ],
  },
  {
    slug: "blue-red-duo",
    name: "Blue + Red Duo",
    description: "The two signature teas, side by side, in a festive sleeve.",
    imageProductSlug: "premium-herbal-blue-tea-teabags",
    productSlugs: ["premium-herbal-blue-tea-teabags", "premium-herbal-red-tea-teabags"],
  },
];
