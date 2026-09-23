"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

const DISMISSED_KEY = "dm_phone_popup_dismissed";
const SHOW_DELAY_MS = 5000;
/** How long to wait before checking again when another dialog is in the way. */
const RETRY_DELAY_MS = 4000;
const PHONE_PATTERN = /^[6-9]\d{9}$/;
/** Must match scripts/add-lucky10-coupon.ts's `code` exactly — a real, working coupon (CLAUDE.md
 * §8 "invent nothing"), never a discount claim with nothing functional behind it. */
const COUPON_CODE = "LUCKY10";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-7" aria-hidden="true">
      <path
        d="M17.6 6.32A7.85 7.85 0 0 0 12.02 4c-4.3 0-7.8 3.5-7.8 7.8 0 1.38.36 2.72 1.05 3.9L4.2 20l4.42-1.16a7.8 7.8 0 0 0 3.4.78h.01c4.3 0 7.8-3.5 7.8-7.8 0-2.08-.82-4.04-2.23-5.5Zm-5.58 12a6.5 6.5 0 0 1-3.31-.9l-.24-.14-2.62.69.7-2.55-.15-.26a6.47 6.47 0 0 1-1-3.45c0-3.58 2.92-6.5 6.51-6.5a6.47 6.47 0 0 1 4.6 1.91 6.44 6.44 0 0 1 1.9 4.6c0 3.58-2.92 6.5-6.5 6.5Zm3.57-4.87c-.2-.1-1.15-.57-1.33-.63-.18-.07-.3-.1-.44.1-.13.19-.5.63-.61.76-.11.13-.23.14-.42.05-.2-.1-.82-.3-1.56-.96-.58-.51-.96-1.15-1.08-1.34-.11-.2-.01-.3.08-.4.09-.1.2-.24.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.44-1.06-.6-1.45-.16-.38-.32-.33-.44-.34h-.38c-.13 0-.34.05-.52.24-.18.19-.68.66-.68 1.62s.7 1.88.79 2.01c.1.13 1.37 2.09 3.32 2.93.46.2.83.32 1.11.41.47.15.9.13 1.24.08.38-.06 1.15-.47 1.32-.93.16-.45.16-.85.11-.93-.05-.08-.18-.13-.38-.23Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M8.7 2H4a2 2 0 0 0-2 2v4.7c0 .27.1.52.3.7l6.3 6.3a1 1 0 0 0 1.4 0l4.7-4.7a1 1 0 0 0 0-1.4L8.4 2.3A1 1 0 0 0 8.7 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
      <path d="M1.5 3.5h7v7h-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.5 6.5h3l2 2v2h-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="4" cy="12" r="1.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="12" r="1.2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * Shown once per browser, a few seconds after landing, offering a real 10%-off-first-order coupon
 * (LUCKY10, scripts/add-lucky10-coupon.ts) in exchange for a phone number and explicit WhatsApp/SMS
 * consent (an unticked checkbox — DPDP-style consent needs to be an active choice, never assumed).
 * The benefit chips below the form state only verifiable facts already established elsewhere in
 * this project (CLAUDE.md §8) — free shipping over ₹500 — rather than an invented claim like
 * "wellness tips" this project doesn't actually produce a cadence of.
 *
 * Suppressed for good via localStorage the moment someone either submits or closes it — a popup
 * like this earns exactly one shot per visitor.
 *
 * Deliberately skips admin/account pages implicitly: it's mounted once in app/layout.tsx, which
 * every route shares, but staff have no reason to see a customer-acquisition popup while working,
 * so it no-ops there.
 */
export function PhoneCapturePopup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Empty deps deliberately — this must run exactly once per real page load, timed from
  // "landing", not once per client-side navigation. app/layout.tsx's RootLayout (where this is
  // mounted) never remounts on navigation, only `pathname` changes, so a `[pathname]` dependency
  // here would restart the 5-second timer — and reopen the popup — on every single link click for
  // the rest of the visit. `pathname` is read once, from the closure captured at mount, which is
  // exactly the page this visitor actually landed on.
  useEffect(() => {
    // Also skipped on /checkout: this popup was appearing mid-checkout and covering the
    // "Continue to payment"/"Continue to pay" buttons — a real reported blocker, not just noise.
    if (pathname.startsWith("/admin") || pathname.startsWith("/account") || pathname.startsWith("/checkout")) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Private browsing / storage blocked — treat as never dismissed, same as any other visitor.
    }
    if (dismissed) return;

    // If another dialog is open when the timer fires (the "last minute add deals" popup, the cart
    // drawer, a quick-add…) or a gift popup is about to show, wait and look again rather than stacking a second popup on top of it.
    let timer: ReturnType<typeof setTimeout>;
    const tryOpen = () => {
      if (document.querySelector('[role="dialog"]') || document.body.dataset.popupPending) {
        timer = setTimeout(tryOpen, RETRY_DELAY_MS);
      } else {
        setOpen(true);
      }
    };
    timer = setTimeout(tryOpen, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: must run once on mount only
  }, []);

  function dismissForGood() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to fall back to — worst case it asks again next visit, not a functional break.
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) dismissForGood();
    setOpen(next);
  }

  const phoneValid = PHONE_PATTERN.test(phone);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/marketing/phone-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, consent: true, sourcePath: pathname }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      dismissForGood();
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-leaf/10 text-leaf">
              <CheckIcon />
            </div>
            <DialogTitle className="mt-4 font-display text-2xl font-semibold text-ink">You&apos;re in!</DialogTitle>
            <DialogDescription className="mt-1.5 text-ink-2">Here&apos;s your code — use it at checkout.</DialogDescription>
            <p className="mt-4 rounded-md border border-dashed border-gold bg-surface-2 py-3 font-display text-2xl font-semibold tracking-[0.1em] text-ink">
              {COUPON_CODE}
            </p>
            <p className="mt-3 text-xs text-ink-2">10% off your first order. We&apos;ll also message you on WhatsApp/SMS with future offers.</p>
          </div>
        ) : (
          <>
            <div className="flex size-14 items-center justify-center rounded-full bg-leaf/10 text-leaf">
              <WhatsAppIcon />
            </div>
            <DialogTitle asChild>
              <p className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.1] text-ink">
                You&apos;re a<br />
                <span className="text-brew-2">Lucky Customer!</span>
              </p>
            </DialogTitle>
            <DialogDescription className="mt-2">
              Enter your number and claim an extra <strong className="font-semibold text-ink">10% off</strong> your first order.
            </DialogDescription>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (phoneValid && consent && !submitting) void submit();
              }}
            >
              <div>
                <label htmlFor="phone-popup-number" className="mb-1 block text-sm font-medium text-ink">
                  Phone number
                </label>
                <Input
                  id="phone-popup-number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                />
              </div>
              <label className="flex items-start gap-2.5 text-sm text-ink-2">
                <Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5" />
                <span>
                  Send me updates on WhatsApp/SMS. I agree to the{" "}
                  <Link href="/privacy" target="_blank" className="underline underline-offset-4 hover:text-ink">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {error && <p role="alert" className="text-sm text-crit">{error}</p>}
              <Button type="submit" variant="gradient" className="w-full" loading={submitting} disabled={!phoneValid || !consent}>
                Claim my 10% off
              </Button>
            </form>
            <div className="mt-4 flex items-center justify-center gap-4 border-t border-line pt-3 text-xs text-ink-2">
              <span className="flex items-center gap-1.5">
                <TagIcon /> 10% off first order
              </span>
              <span className="flex items-center gap-1.5">
                <TruckIcon /> Free shipping ₹500+
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
