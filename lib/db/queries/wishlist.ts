import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../index";
import { notGiftOnly } from "./gift-only";
import { products, productImages, variants, wishlistItems } from "../schema";

export async function getWishlistProductIds(userId: number): Promise<number[]> {
  const rows = await db.select({ productId: wishlistItems.productId }).from(wishlistItems).where(eq(wishlistItems.userId, userId));
  return rows.map((r) => r.productId);
}

export interface WishlistCard {
  productId: number;
  slug: string;
  name: string;
  priceFromPaise: number;
  mrpFromPaise: number;
  imageStorageKey: string | null;
  imageAlt: string | null;
  inStock: boolean;
}

/** Full product cards for a user's wishlist (app/account/wishlist). Not `unstable_cache`d — it's
 * per-user data (CLAUDE.md §3.4's cache tags are all public/shared), and account pages are never
 * meant to be served from a shared cache. */
export async function getWishlistCards(userId: number): Promise<WishlistCard[]> {
  const productIds = await getWishlistProductIds(userId);
  if (productIds.length === 0) return [];

  const productRows = await db.select().from(products).where(inArray(products.id, productIds));
  const variantRows = await db.select().from(variants).where(and(inArray(variants.productId, productIds), notGiftOnly));
  const imageRows = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, productIds));

  const cards: WishlistCard[] = [];
  for (const p of productRows) {
    const vs = variantRows.filter((v) => v.productId === p.id);
    const primaryImage = imageRows.find((i) => i.productId === p.id && i.isPrimary) ?? imageRows.find((i) => i.productId === p.id);
    const cheapest = vs.reduce<typeof vs[number] | null>((min, v) => (min == null || v.pricePaise < min.pricePaise ? v : min), null);
    cards.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      priceFromPaise: cheapest ? cheapest.pricePaise : 0,
      mrpFromPaise: cheapest ? cheapest.mrpPaise : 0,
      imageStorageKey: primaryImage?.storageKey ?? null,
      imageAlt: primaryImage?.alt ?? null,
      inStock: vs.some((v) => v.inStock),
    });
  }
  return cards;
}

/** Header wishlist count when signed in (PROMPTS.md Phase 6 item 4). */
export async function getWishlistCount(userId: number): Promise<number> {
  const ids = await getWishlistProductIds(userId);
  return ids.length;
}
