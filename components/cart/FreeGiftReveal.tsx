"use client";

import { useCartStore, selectFreeGiftEligible, selectHasFreeGift } from "@/lib/store/cart";

/**
 * The cart's free-gift line (client brief, 2026-09-20): once the cart clears the free-gift threshold and
 * no gift has been picked, say so and let the shopper reopen the gift popup — for anyone who closed it
 * without choosing. Disappears the moment a gift is in the cart. Shown in the cart drawer and on /cart.
 */
export function FreeGiftReveal() {
  const eligible = useCartStore(selectFreeGiftEligible);
  const hasFreeGift = useCartStore(selectHasFreeGift);
  const openGiftPopup = useCartStore((s) => s.openGiftPopup);

  if (!eligible || hasFreeGift) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-surface-2/70 p-3">
      <span aria-hidden="true" className="text-2xl">
        🎁
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">You&apos;re eligible for a free gift!</p>
        <p className="text-xs text-ink-2">Pick one — it&apos;s added at no charge.</p>
      </div>
      <button
        type="button"
        onClick={openGiftPopup}
        className="shrink-0 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-surface transition-colors duration-[180ms] hover:bg-ink/90"
      >
        Click to reveal
      </button>
    </div>
  );
}
