import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** A considered empty-cart state (PROMPTS.md Phase 5 item 2: "not a bare 'cart is empty' line",
 * cart-redesign brief §16) — points somewhere useful rather than just stating the obvious.
 * `bestsellers`, when passed (the full `/cart` page only — the drawer's compact form skips it to
 * stay short), is a Server Component slot (EmptyCartBestsellers.tsx) so a dead-end empty cart still
 * has a real, catalogue-backed way forward. */
export function EmptyCart({
  compact = false,
  bestsellers,
  onNavigate,
}: {
  compact?: boolean;
  bestsellers?: ReactNode;
  /** Called when a shop/browse link is followed — the cart drawer passes its `close`, so the drawer
   * doesn't stay open over the page the shopper just chose to go to. */
  onNavigate?: () => void;
}) {
  return (
    <div className={compact ? "flex flex-col items-center gap-3 py-10 text-center" : "flex flex-col items-center gap-4 py-20 text-center"}>
      <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <svg viewBox="0 0 24 24" fill="none" className="size-6">
          <path
            d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20.5 8H6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <p className="font-display text-lg font-semibold text-ink">Your cart is empty, for now</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">
          Looks like your spice box needs a little something — start with our Blue Tea, the one that turns violet with lemon.
        </p>
      </div>
      <Button asChild variant="gradient" size="md">
        <Link href="/collections/blue-tea/" onClick={onNavigate}>
          Shop Blue Tea
        </Link>
      </Button>
      <Link href="/shop/" onClick={onNavigate} className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
        Or browse everything
      </Link>
      {bestsellers}
    </div>
  );
}
