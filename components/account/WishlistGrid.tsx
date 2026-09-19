"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { removeFromWishlistAction } from "@/lib/actions/wishlist";
import { paise } from "@/lib/money";
import type { WishlistCard } from "@/lib/db/queries/wishlist";

/** Saved products, on the same card shape as the rest of the store (square image on the neutral
 * ground, name, price, one full-width action). The image used to be an empty grey square: the
 * query returned a storage key, and nothing turned it into a URL. */
export function WishlistGrid({ items }: { items: (WishlistCard & { imageUrl: string | null })[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleRemove = async (productId: number) => {
    setBusyId(productId);
    await removeFromWishlistAction(productId);
    setBusyId(null);
    router.refresh();
  };

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.productId} className="flex flex-col overflow-hidden rounded-lg bg-surface shadow-card">
          <Link href={`/product/${item.slug}/`} className="relative block aspect-square overflow-hidden bg-surface-2" aria-label={item.name}>
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- already-sized storage derivative, same as ProductCard.
              <img src={item.imageUrl} alt={item.imageAlt ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            )}
          </Link>
          <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
            <Link href={`/product/${item.slug}/`} className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-ink hover:underline">
              {item.name}
            </Link>
            <div className="mt-auto flex flex-col gap-3 pt-1">
              {item.inStock ? (
                <PriceBlock mrpPaise={paise(item.mrpFromPaise)} pricePaise={paise(item.priceFromPaise)} prefix="From" />
              ) : (
                <p className="text-sm font-medium text-crit">Out of stock</p>
              )}
              <Button asChild variant="gradient" size="sm" className="w-full">
                <Link href={`/product/${item.slug}/`}>View product</Link>
              </Button>
              <Button variant="ghost" size="sm" className="w-full" disabled={busyId === item.productId} onClick={() => handleRemove(item.productId)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
