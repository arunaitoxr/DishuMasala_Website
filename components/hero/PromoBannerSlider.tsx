"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { HomepageBanner } from "@/lib/db/queries/settings";

const AUTOPLAY_MS = 3000;

/**
 * The client-supplied homepage promotional slider (scripts/migrate-homepage-banners.ts). This is
 * a deliberate, logged exception to this project's usual design/copy discipline — see that
 * script's header comment and CLAUDE.md §8 for the full note: these banner images carry the
 * client's own marketing text baked into the pixels (including phrasing this project would never
 * write itself), used as-is because the client explicitly chose that after Claude flagged the
 * conflict directly.
 *
 * The first thing on the homepage (app/page.tsx) — the animated Lemon Shift hero that used to sit
 * below this was removed at the client's request; this slider is now the top of the page.
 *
 * Reused as-is (via `ariaLabel`) for every other banner slot on the site (Red Tea, Classic Tea,
 * Spices, and each collection page's own hero) — it already renders correctly with exactly one
 * banner (no dots/arrows/autoplay, since those all gate on `banners.length > 1`), so there was no
 * need for a second component.
 *
 * Section banners (Red Tea, Spices, Black Tea) are contained, rounded-corner cards (client request,
 * 2026-09-11). The homepage's main slider is the exception again as of 2026-09-20 (client request:
 * "make it fill the screen, no need for border") — `fullBleed` runs it edge to edge with no card,
 * padding or container around it.
 */
export function PromoBannerSlider({
  banners,
  ariaLabel = "Promotions",
  frameRatio,
  fullBleed = false,
}: {
  banners: HomepageBanner[];
  ariaLabel?: string;
  /**
   * Forces every slide into one fixed frame instead of following each banner's own shape.
   *
   * Added 2026-09-17. The collection pages needed this: their client-supplied banners range from
   * 1200x400 to 1200x800, so with per-banner ratios /collections/spices rendered a 410px-tall hero
   * and /collections/classic-teas an 821px one — exactly double, which is what "one has large
   * banner, one has small" meant. A fixed frame makes every collection page open identically.
   *
   * Safe to letterbox because the images are already drawn with `object-contain`, so nothing is
   * ever cropped — a banner shorter than the frame simply sits on the frame's own cream ground,
   * which is also the background most of these compositions already use, so the seam barely reads.
   *
   * The homepage deliberately does NOT pass this: its banner set is already a consistent shape and
   * the client has signed that layout off.
   */
  frameRatio?: { mobile: string; desktop: string };
  /** Edge to edge across the viewport, no card, padding or page container — the homepage's main
   * slider only. */
  fullBleed?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion || banners.length < 2) return;
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [index, playing, reducedMotion, banners.length]);

  if (banners.length === 0) return null;

  // Each slide's own real aspect ratio, never a fixed guess (see app/globals.css's
  // .promo-banner-frame) — client-supplied banners vary widely in shape (some collection-page
  // heroes are 1200x400, others 1200x800), and a fixed box cropped real content off the sides or
  // top/bottom via object-cover whenever a banner's actual shape didn't match it. Falls back to the
  // desktop ratio on mobile when a slide has no dedicated mobile crop.
  const current = banners[index];
  const naturalDesktopRatio = current ? `${current.width} / ${current.height}` : "21 / 9";
  const naturalMobileRatio = current?.mobile ? `${current.mobile.width} / ${current.mobile.height}` : naturalDesktopRatio;
  const desktopRatio = frameRatio?.desktop ?? naturalDesktopRatio;
  const mobileRatio = frameRatio?.mobile ?? naturalMobileRatio;

  function goTo(i: number) {
    setIndex(((i % banners.length) + banners.length) % banners.length);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0) {
        goTo(index + 1);
      } else {
        goTo(index - 1);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // Slide dots + pause. Over the image for the contained section banners; below it for the
  // full-bleed main banner, whose artwork runs a badge row along its bottom edge that the dots were
  // covering ("No artificial colours" on desktop, the spice icons on mobile).
  const controls = (
    <div
      className={
        fullBleed
          ? "flex items-center justify-center gap-3 bg-bg py-3"
          : "absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-3"
      }
    >
      <div className={`flex gap-2 rounded-full px-3 py-1.5 ${fullBleed ? "" : "bg-ink/40 backdrop-blur-sm"}`}>
        {banners.map((banner, i) => (
          <button
            key={banner.slot}
            type="button"
            aria-label={`Go to slide ${i + 1} of ${banners.length}`}
            aria-current={i === index}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo(i);
            }}
            className={`size-2 rounded-full transition-colors ${
              fullBleed ? (i === index ? "bg-ink" : "bg-ink/25") : i === index ? "bg-white" : "bg-white/40"
            }`}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label={playing ? "Pause slideshow" : "Play slideshow"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPlaying((p) => !p);
        }}
        className={`flex size-7 items-center justify-center rounded-full ${
          fullBleed ? "border border-line bg-surface text-ink" : "bg-ink/40 text-white backdrop-blur-sm"
        }`}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3" aria-hidden="true">
            <rect x="3" y="2" width="3" height="12" rx="0.5" />
            <rect x="10" y="2" width="3" height="12" rx="0.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3" aria-hidden="true">
            <path d="M4 2.5v11l10-5.5-10-5.5Z" />
          </svg>
        )}
      </button>
    </div>
  );

  const frame = (
    <div
      ref={containerRef}
      className={`promo-banner-frame relative w-full overflow-hidden ${fullBleed ? "" : "rounded-xl bg-surface-2 shadow-card"}`}
      style={
        {
          "--pb-ratio-mobile": mobileRatio,
          "--pb-ratio-desktop": desktopRatio,
        } as React.CSSProperties
      }
      onMouseEnter={() => setPlaying(false)}
      onMouseLeave={() => setPlaying(true)}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {banners.map((banner, i) => (
        <Link
          key={banner.slot}
          href={banner.href}
          aria-hidden={i !== index}
          tabIndex={i === index ? 0 : -1}
          className="absolute inset-0 transition-opacity duration-500 ease-out flex items-center justify-center"
          style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? "auto" : "none" }}
        >
          {/* Blurred backdrop, only in fixed-frame mode.
           *
           * A fixed frame plus `object-contain` guarantees equal heights without ever cropping a
           * banner, but it leaves bars wherever a banner is a different shape than the frame — and
           * on a plain cream ground those bars are obvious against a banner whose own background is
           * dark (Classic & Assam's sunset is the worst case, ~230px a side). Filling them with an
           * over-scaled, heavily blurred copy of the same banner makes the frame read as one image
           * that fades at the edges rather than as a small picture in a big box. No extra request:
           * it is the same `src`, so the browser reuses the decoded image. */
          frameRatio && (
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
              <Image
                src={banner.url}
                alt=""
                fill
                sizes="100vw"
                className="scale-110 object-cover blur-2xl"
                aria-hidden="true"
              />
              <span className="absolute inset-0 bg-bg/25" />
            </span>
          )}
          {banner.mobile && (
            <Image
              src={banner.mobile.url}
              alt={banner.alt}
              fill
              priority={i === 0}
              sizes="100vw"
              className="object-contain sm:hidden"
            />
          )}
          <Image
            src={banner.url}
            alt={banner.alt}
            fill
            priority={i === 0}
            sizes="100vw"
            className={`object-contain ${banner.mobile ? "hidden sm:block" : ""}`}
          />
        </Link>
      ))}

      {banners.length > 1 && !fullBleed && controls}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo(index - 1);
            }}
            className="absolute left-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-white backdrop-blur-sm transition-all hover:bg-ink/60 active:scale-95"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M12.5 15 7.5 10l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo(index + 1);
            }}
            className="absolute right-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-white backdrop-blur-sm transition-all hover:bg-ink/60 active:scale-95"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M7.5 15 12.5 10l-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </div>
  );

  if (fullBleed) {
    return (
      <section aria-roledescription="carousel" aria-label={ariaLabel} className="w-full">
        {frame}
        {banners.length > 1 && controls}
      </section>
    );
  }

  return (
    // A banner stacked directly under another drops its top padding, so two in a row sit one gap
    // apart (32px) rather than two (64px).
    <section
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      className="w-full bg-bg py-6 sm:py-8 [section[aria-roledescription=carousel]+&]:pt-0"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">{frame}</div>
    </section>
  );
}
