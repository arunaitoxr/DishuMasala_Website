"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/sections/SectionHeading";
import type { ProductVideo as ProductVideoData } from "@/content/product-videos";

/**
 * The client-supplied product video (content/product-videos.ts), in its own section after the
 * product details (client request, 2026-09-20). It starts muted and looping as soon as at least half
 * of it scrolls into view, and pauses when it leaves — browsers only allow autoplay when muted, so
 * the shopper turns sound on with the button (or the native controls). Autoplay is skipped entirely
 * under prefers-reduced-motion: the video then waits for an explicit play. The footage is portrait,
 * so it sits in a phone-shaped frame at its real aspect ratio.
 */
export function ProductVideo({ video }: { video: ProductVideoData }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // A blocked or interrupted play() is harmless — the native controls still work.
          el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-labelledby="product-video-heading" className="flex flex-col items-center gap-6 text-center">
      <SectionHeading id="product-video-heading" eyebrow="Product video" heading="Watch the video" align="center" />
      <div className="relative w-full max-w-xs sm:max-w-sm">
        <video
          ref={ref}
          src={video.url}
          muted={muted}
          loop
          controls
          playsInline
          preload="metadata"
          aria-label={video.alt}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          style={{ aspectRatio: `${video.width} / ${video.height}` }}
          className="w-full rounded-lg bg-ink object-contain shadow-card"
        />
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-ink/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors duration-[180ms] hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brew-2"
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
            <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
            {muted ? (
              <path d="m13.5 7.5 4 5m0-5-4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M13.5 7a4 4 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
          {muted ? "Sound off" : "Sound on"}
        </button>
      </div>
    </section>
  );
}
