/**
 * Domain types for the catalogue. Deliberately hand-rolled plain TypeScript (not
 * `InferSelectModel<typeof products>` from Drizzle) so this file has no drizzle-orm import and
 * anything outside lib/db/ can depend on it — see CLAUDE.md §6: "Nothing outside lib/db/ imports
 * Drizzle. Everything else consumes the domain types in types/catalog.ts, types/order.ts."
 */
import type { Paise } from "@/lib/money";

export type ContentStatus = "draft" | "published";

export interface Collection {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  priority: number;
  accentToken: string | null;
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

/** A collection annotated with the aggregate stats the storefront needs (product count, price range). */
export interface CollectionSummary extends Collection {
  productCount: number;
  minPricePaise: Paise | null;
  maxPricePaise: Paise | null;
}

export interface ProductImage {
  id: number;
  productId: number;
  storageKey: string;
  alt: string;
  width: number;
  height: number;
  position: number;
  isPrimary: boolean;
}

export interface Variant {
  id: number;
  productId: number;
  sku: string;
  optionValue: string;
  mrpPaise: Paise;
  pricePaise: Paise;
  /** Nullable — the source catalogue has no per-variant weights yet (PRD §3.1). */
  weightGrams: number | null;
  inStock: boolean;
  /** Nullable — stock is boolean unless a real count exists (CLAUDE.md §7.6). Never invent one. */
  stockQty: number | null;
  position: number;
  /** This variant's own real pack photo (storage-resolved URL), when it has one — e.g. Blue Tea
   * loose's 2-pack/4-pack. Null for every variant that has none; callers fall back to the
   * product's shared primary image in that case. */
  imageUrl: string | null;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  collectionId: number;
  shortDescription: string | null;
  description: string | null;
  ingredients: string | null;
  brewGuide: string | null;
  tags: string[];
  optionLabel: string;
  priority: number;
  status: ContentStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithVariants extends Product {
  variants: Variant[];
  images: ProductImage[];
}

/** A product image resolved to a real, absolute URL — the shape every card/thumbnail consumer
 * actually needs to render an `<img>`/`<Image>`, as opposed to `ProductImage`'s raw `storageKey` (which
 * only a server-only module may resolve via `publicUrl`, CLAUDE.md §3.3). */
export interface ProductThumbnail {
  url: string;
  alt: string;
  width: number;
  height: number;
}

/** A product with its variants plus its parent collection's slug/title denormalised alongside it —
 * exactly the shape the homepage sections (components/sections/*) and ProductCard need, without any
 * of them touching lib/db themselves. `images` is ordered position-first (primary first) and empty
 * for a product with none migrated yet, never omitted. */
export interface ProductCardData extends Product {
  variants: Variant[];
  collectionSlug: string;
  collectionTitle: string;
  images: ProductThumbnail[];
  /** Approved review aggregate computed from Supabase/Postgres. Omitted only when a card query
   * intentionally does not need the extra aggregate. */
  rating?: { value: number; count: number };
}
