"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { CartLineItem } from "./CartLineItem";
import { CartNotices } from "./CartNotices";
import { EmptyCart } from "./EmptyCart";
import { FreeGiftReveal } from "./FreeGiftReveal";
import { FreeShippingProgress } from "./FreeShippingProgress";
import { CouponField } from "./CouponField";
import { OrderSummary } from "./OrderSummary";
import { TrustIndicators } from "./TrustIndicators";
import { useCartStore, selectFreeShippingThresholdPaise, selectRupeesToFreeShippingPaise, selectSubtotalPaise } from "@/lib/store/cart";

/**
 * The slide-in cart (PROMPTS.md Phase 5 item 2, redesigned per the cart-redesign brief §2/§18/§26).
 * Fully keyboard-operable via the underlying Radix Dialog (Drawer): focus trapped inside, Escape
 * closes, focus returns to whatever opened it.
 *
 * Structure follows the brief's exact hierarchy (§22/§26): header → free-shipping progress → cart
 * items → combo upsell → "you may also like" → coupon → order summary → checkout CTA → trust
 * indicators. The header and the summary/CTA/trust footer are sticky; only the middle section
 * scrolls (`padded={false}` on DrawerContent so this component owns its own edge-to-edge layout).
 */
export function CartDrawer({ upsells }: { upsells: ReactNode }) {
  const isOpen = useCartStore((s) => s.isOpen);
  const open = useCartStore((s) => s.open);
  const close = useCartStore((s) => s.close);
  const lines = useCartStore((s) => s.lines);
  const pricing = useCartStore((s) => s.pricing);
  const subtotalPaise = useCartStore(selectSubtotalPaise);
  const thresholdPaise = useCartStore(selectFreeShippingThresholdPaise);
  const rupeesToGoPaise = useCartStore(selectRupeesToFreeShippingPaise);
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <Drawer open={isOpen} onOpenChange={(next) => (next ? open() : close())}>
      <DrawerContent side="right" width="cart" padded={false} showDefaultClose={false} className="flex flex-col">
        <VisuallyHidden>
          <DrawerTitle>Your cart</DrawerTitle>
          <DrawerDescription>Review items, apply a coupon and check out.</DrawerDescription>
        </VisuallyHidden>

        {/* HEADER — sticky. It carries the drawer's only close button, so DrawerContent's default one
            is switched off above (both were rendering, a double cross). */}
        <div className="flex shrink-0 items-start justify-between border-b border-line/70 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold leading-none text-ink">Your cart</h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-2">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="-mr-1 -mt-1 flex size-9 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-5">
            <CartNotices />
            <EmptyCart compact onNavigate={close} />
          </div>
        ) : (
          <>
            {/* BODY — independently scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-5">
                <CartNotices />

                {thresholdPaise != null && rupeesToGoPaise != null && (
                  <FreeShippingProgress subtotalPaise={subtotalPaise} thresholdPaise={thresholdPaise} rupeesToGoPaise={rupeesToGoPaise} />
                )}

                <FreeGiftReveal />

                <ul>
                  {lines.map((line) => (
                    <CartLineItem key={line.variantId} line={line} />
                  ))}
                </ul>

                {upsells}

                <CouponField />
              </div>
            </div>

            {/* FOOTER — sticky. Client request (2026-09-24): compacted (smaller Total, tighter
                spacing, a "md" not "lg" CTA) so this block takes less of the drawer's height,
                especially with a long cart above it. */}
            <div className="shrink-0 border-t border-line/70 px-5 py-3">
              <OrderSummary pricing={pricing} compact />
              <Button asChild variant="gradient" size="md" onClick={close} className="mt-3 w-full">
                <Link href="/checkout/">Proceed to checkout</Link>
              </Button>
              <Link
                href="/cart/"
                onClick={close}
                className="mt-2 block text-center text-xs font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                View full cart
              </Link>
              <TrustIndicators className="mt-2.5" />
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
