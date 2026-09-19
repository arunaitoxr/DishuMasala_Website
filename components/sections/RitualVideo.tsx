"use client";

import { useEffect, useRef } from "react";

/**
 * The client-supplied Blue Tea clip for the homepage ritual teaser. It is also the same approved
 * video surfaced in Blue Tea product galleries, so the experience stays visually consistent.
 *
 * Autoplay only when `prefers-reduced-motion` allows it (CLAUDE.md §5.5: motion collapses to a
 * finished static state under that setting) — checked once on mount rather than relying on a CSS
 * rule, since `autoplay`/`loop` are element behaviour, not a CSS animation the site's global
 * reduced-motion override can intercept. `controls` stays on regardless, so a shopper who has
 * autoplay disabled can still choose to watch it.
 */
export function RitualVideo({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.autoplay = true;
    video.loop = true;
    void video.play().catch(() => {
      // Autoplay can still be blocked by the browser even when reduced-motion allows it (e.g. a
      // strict autoplay policy) — the video just sits on its first frame with visible controls.
    });
  }, []);

  return (
    <video
      ref={videoRef}
      src="/product-videos/BlueTea.mp4"
      muted
      playsInline
      controls
      preload="metadata"
      className={className}
      style={{ aspectRatio: "4 / 5", width: "100%", objectFit: "cover" }}
      aria-label="Blue Tea preparation video"
    />
  );
}
