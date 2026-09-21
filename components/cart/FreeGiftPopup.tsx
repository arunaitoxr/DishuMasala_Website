"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { PartyPopper } from "@/components/effects/PartyPopper";
import { Placeholder } from "@/components/media/Placeholder";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/money";
import { useCartStore, selectFreeGiftEligible, selectFreeGiftThresholdPaise, selectHasFreeGift } from "@/lib/store/cart";
import type { FreeGiftOption } from "@/lib/db/queries/free-gift";
import { pillarsOf } from "@/lib/pillars";

/** The pillars a gift can come from, in the order they are listed. */
const GIFT_PILLAR_ORDER: FreeGiftOption["pillar"][] = ["red-tea", "blue-tea", "classic-teas", "spices"];

/**
 * The gift menu: at most three items, one per pillar the shopper is NOT already buying — buying Red Tea
 * shows the Blue Tea 20 gm, Black Tea 100 gm and a spice (client brief, 2026-09-20). Where a pillar has
 * several allowed gifts (three spices, two black teas) one is shown, chosen from the first paid product
 * in the cart, so the spice on offer differs by what was bought but never flips on a re-render.
 *
 * When the cart already holds every pillar there is nothing "new" to exclude, so three of the four are
 * shown anyway (which three rotates with that same seed) — the server accepts any gift in that case.
 */
function pickGiftMenu(options: FreeGiftOption[], cartPillars: ReadonlySet<string>, seedProductId: number): FreeGiftOption[] {
  const allInCart = GIFT_PILLAR_ORDER.every((p) => cartPillars.has(p));
  const pillars = allInCart
    ? GIFT_PILLAR_ORDER.map((_, i) => GIFT_PILLAR_ORDER[(i + seedProductId) % GIFT_PILLAR_ORDER.length])
    : GIFT_PILLAR_ORDER.filter((p) => !cartPillars.has(p));

  const menu: FreeGiftOption[] = [];
  for (const pillar of pillars) {
    const inPillar = options.filter((o) => o.pillar === pillar && o.inStock).sort((a, b) => a.variantId - b.variantId);
    if (inPillar.length === 0) continue;
    menu.push(inPillar[seedProductId % inPillar.length]);
  }
  return menu.slice(0, 3);
}

/**
 * The "choose your free gift" popup (client rule, 2026-09-17) — appears once per cart session the
 * moment the (non-gift) subtotal clears `getFreeGiftThresholdPaise()` (`selectFreeGiftEligible`),
 * offering only the real, allowlisted gift variants (`getFreeGiftOptions()`) whose pillar ISN'T
 * already in the cart: buying Blue Tea offers Red Tea / Spices (Coriander, Turmeric or Red Chilli)
 * / Black Tea as gifts, never another Blue Tea — matching the same exclusion
 * `lib/commerce/pricing.ts` enforces server-side, so the menu here never offers something the
 * server would then reject. Picking one calls the ordinary `addItem` with `isGift: true`;
 * `revalidate()` immediately re-confirms it server-side, so the price shown here as "FREE" is
 * never trusted at face value (CLAUDE.md §7.5).
 *
 * "Once per session" is deliberately just component state, not `sessionStorage`: it resets on a
 * hard refresh, which is fine — the popup re-appears, sees the shopper already has a gift line
 * (`hasFreeGift`), and stays closed. It only nags again if the gift was actually removed.
 */
export function FreeGiftPopup({ options }: { options: FreeGiftOption[] }) {
  const eligible = useCartStore(selectFreeGiftEligible);
  const hasFreeGift = useCartStore(selectHasFreeGift);
  const thresholdPaise = useCartStore(selectFreeGiftThresholdPaise);
  const pricing = useCartStore((s) => s.pricing);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.open);
  const [open, setOpen] = useState(false);
  const [addingVariantId, setAddingVariantId] = useState<number | null>(null);
  const hasOfferedThisSession = useRef(false);
  // The gift just picked — while set, the popup shows a short "gift added" celebration (confetti
  // behind it) before closing itself.
  const [chosen, setChosen] = useState<FreeGiftOption | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(celebrationTimer.current), []);

  useEffect(() => {
    // The offer is "armed" once per crossing of the threshold: it opens the first time the cart is
    // eligible with no gift picked, and stays quiet if the shopper closes it (they can reopen it from
    // the cart — see FreeGiftReveal). Dropping below the threshold, or having a gift, re-arms it, so
    // crossing the line again later offers it again instead of staying silent until a page refresh.
    if (!eligible || hasFreeGift) {
      hasOfferedThisSession.current = false;
      return;
    }
    if (hasOfferedThisSession.current) return;
    // Held back while the "last minute add deals" popup is open (that add is what usually pushes the
    // cart over the line), so the two never stack: the gift popup is the "one more" that follows it.
    // `data-popup-pending` tells the sign-up popup (PhoneCapturePopup) a gift popup is about to show,
    // so it holds back for the gap between the deals popup closing and this one opening.
    document.body.dataset.popupPending = "gift";
    let timer: ReturnType<typeof setTimeout>;
    const tryOpen = () => {
      if (document.querySelector('[data-popup="deals"]')) {
        timer = setTimeout(tryOpen, 150);
      } else {
        hasOfferedThisSession.current = true;
        delete document.body.dataset.popupPending;
        setOpen(true);
      }
    };
    timer = setTimeout(tryOpen, 300);
    return () => {
      clearTimeout(timer);
      delete document.body.dataset.popupPending;
    };
  }, [eligible, hasFreeGift]);

  // "Click to reveal" in the cart asks for the popup again.
  useEffect(() => {
    return useCartStore.subscribe((state, prev) => {
      if (state.giftPopupRequests !== prev.giftPopupRequests) setOpen(true);
    });
  }, []);

  // Pillars already being bought (paid lines only) — a gift from one of these is hidden here even
  // though pricing.ts would reject it anyway, so the menu never shows a choice that can't work.
  // `pricing.lines`' `collectionSlug` values ("blue-tea"/"red-tea"/"classic-teas"/"spices") match
  // `FreeGiftOption.pillar` 1:1 by construction — no separate mapping needed; "combos" (or
  // anything else) simply never matches any pillar, same as pricing.ts's own `cartPillarOf`.
  const paidLines = (pricing?.lines ?? []).filter((l) => !l.isGift);
  // Combos count as the pillars they contain (lib/pillars.ts) — a Blue + Red tea combo is both teas.
  const cartPillars = new Set(paidLines.flatMap((l) => pillarsOf(l.collectionSlug, l.productSlug)));
  const eligibleOptions = pickGiftMenu(options, cartPillars, paidLines[0]?.productId ?? 0);

  if (eligibleOptions.length === 0 || thresholdPaise == null) return null;

  async function choose(option: FreeGiftOption) {
    setAddingVariantId(option.variantId);
    // `skipDeals`: keeps the cart drawer from opening underneath the celebration; it opens after it.
    await addItem(
      {
        variantId: option.variantId,
        productId: option.productId,
        priority: option.priority,
        qty: 1,
        productName: option.productName,
        optionValue: option.optionValue,
        sku: option.sku,
        mrpPaise: option.mrpPaise,
        unitPricePaise: 0,
        imageUrl: option.image?.url ?? null,
        isGift: true,
      },
      { skipDeals: true },
    );
    setAddingVariantId(null);

    // The server re-checks every gift; if it declined this one (the cart shows a notice) there is
    // nothing to celebrate.
    const added = useCartStore.getState().lines.some((l) => l.variantId === option.variantId && l.isGift);
    if (!added) {
      setOpen(false);
      openCart();
      return;
    }
    setChosen(option);
    celebrationTimer.current = setTimeout(() => {
      setOpen(false);
      setChosen(null);
      openCart();
    }, 2600);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      clearTimeout(celebrationTimer.current);
      // Closing the celebration early still takes the shopper to their cart, gift and all.
      if (chosen) openCart();
      setChosen(null);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-[fade-in_180ms_ease]" />
        {/* The confetti sits on layer 50 (over the dimmed page) and the panel on 51, so it always paints
            behind the popup whatever the DOM order ends up as. Mounted only once a gift is picked. */}
        {chosen && <PartyPopper />}
        <DialogPrimitive.Content
          data-popup="gift"
          className="fixed left-1/2 top-1/2 z-[51] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-lift focus:outline-none data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(.2,.6,.2,1)]"
        >
          {chosen ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
              <div className="relative size-24 overflow-hidden rounded-lg border border-line/60 bg-surface-2">
                {chosen.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small fixed-size thumbnail, not worth next/image's overhead here.
                  <img src={chosen.image.url} alt={chosen.image.alt} className="size-full object-contain mix-blend-multiply" />
                ) : (
                  <Placeholder slot="product-packshot-generic" className="size-full" />
                )}
              </div>
              <DialogTitle className="font-display text-xl font-semibold text-ink">
                <span aria-hidden="true">🎉 </span>Your free gift is added!
              </DialogTitle>
              <DialogDescription className="text-sm text-ink-2">
                {chosen.productName} <span className="text-ink-2">({chosen.optionValue})</span> is in your cart at no charge.
              </DialogDescription>
            </div>
          ) : (
            <>
              <DialogTitle className="font-display text-lg font-semibold text-ink">🎁 You&apos;ve unlocked a free gift!</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-ink-2">
                Your order qualifies for a free gift — pick one to add it at no charge.
              </DialogDescription>

              <ul className="mt-5 flex flex-col gap-3">
                {eligibleOptions.map((option) => (
                  <li key={option.variantId} className="flex items-center gap-3 rounded-md border border-line p-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-line/60 bg-surface-2">
                      {option.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small fixed-size thumbnail, not worth next/image's overhead here.
                        <img src={option.image.url} alt={option.image.alt} className="size-full object-contain mix-blend-multiply" />
                      ) : (
                        <Placeholder slot="product-packshot-generic" className="size-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {option.productName} <span className="font-normal text-ink-2">({option.optionValue})</span>
                      </p>
                      <p className="text-xs text-ink-2">
                        <span className="line-through">{formatINR(option.mrpPaise)}</span>{" "}
                        <span className="font-semibold text-leaf">FREE</span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!option.inStock || addingVariantId != null}
                      onClick={() => void choose(option)}
                    >
                      {addingVariantId === option.variantId ? "Adding…" : "Choose"}
                    </Button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="mt-4 w-full text-center text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                No thanks, maybe later
              </button>
            </>
          )}

          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
