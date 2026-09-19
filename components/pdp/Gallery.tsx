"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Placeholder } from "@/components/media/Placeholder";
import { ImageLightbox } from "./ImageLightbox";
import { cn } from "@/lib/cn";

export interface ImageGallerySlide {
  kind: "image";
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface VideoGallerySlide {
  kind: "video";
  url: string;
  alt: string;
  width: number;
  height: number;
}

export type GallerySlide = ImageGallerySlide | VideoGallerySlide;

export interface GalleryProps {
  productName: string;
  /** Real `product_images` rows, already resolved to public URLs, position-ordered, primary
   * first — empty until scripts/migrate-images.ts has run (CLAUDE.md §8). */
  slides: GallerySlide[];
  className?: string;
}

/**
 * No real product photography exists yet anywhere in the catalogue (migrate-images.ts has never
 * run — every `slides` array passed in today is empty), so this always falls back to exactly one
 * placeholder slide. The component is still built as the real, multi-image gallery it will become
 * the moment real images land: thumbnail rail, click-to-zoom, swipe, and full keyboard support all
 * operate over `slides.length` generically rather than being hand-fitted to "just one image".
 */
export function Gallery({ productName, slides, className }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasReal = slides.length > 0;
  const count = hasReal ? slides.length : 1;
  const current = hasReal ? slides[index] : null;
  const imageSlides = slides.filter((slide): slide is ImageGallerySlide => slide.kind === "image");

  const goTo = (i: number) => setIndex(((i % count) + count) % count);

  // Keeps the active thumbnail in view as it scrolls with keyboard/swipe navigation — the rail
  // itself scrolls (see the `overflow-x-auto` wrapper below) rather than pushing the page wider,
  // so without this the active thumbnail could sit off-screen with no visual cue where it went.
  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  const openLightbox = () => {
    if (current?.kind === "image") setZoomOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    } else if ((e.key === "Enter" || e.key === " ") && current?.kind === "image") {
      e.preventDefault();
      openLightbox();
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? index + 1 : index - 1);
    touchStartX.current = null;
  };

  const activeAlt = current?.alt ?? `${productName} — product photo (placeholder; real photography coming soon)`;

  function Thumb(i: number, vertical: boolean) {
    return (
      <button
        key={i}
        ref={(el) => {
          thumbRefs.current[i] = el;
        }}
        type="button"
        role="tab"
        aria-selected={i === index}
        aria-label={`View ${slides[i]?.kind === "video" ? "video" : "photo"} ${i + 1} of ${count}`}
        onClick={() => goTo(i)}
        className={cn(
          "shrink-0 overflow-hidden rounded-md border-2 transition-colors duration-[180ms]",
          vertical ? "size-[72px]" : "size-16",
          i === index ? "border-brew-2" : "border-transparent hover:border-line",
        )}
        style={{ aspectRatio: "1 / 1" }}
      >
        {slides[i]?.kind === "image" ? (
          <Image src={slides[i].url} alt="" width={72} height={72} className="h-full w-full object-cover" />
        ) : slides[i]?.kind === "video" ? (
          <span className="relative block h-full w-full bg-ink">
            <video src={slides[i].url} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-hidden="true" />
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-ink/25 text-white">
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5"><path d="M6 4.5v11l9-5.5-9-5.5Z" /></svg>
            </span>
          </span>
        ) : (
          <Placeholder slot="product-packshot-generic" className="h-full w-full" />
        )}
      </button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Reference layout (blueteaindia.co.in): a vertical thumbnail rail sits to the LEFT of the
       * large image on desktop, not below it — the thumbnail row below is kept for mobile/tablet,
       * where a horizontal scroll strip under the image is the usable pattern. Both rails drive the
       * same `index` state; only one is visible at a given breakpoint. */}
      <div className="flex flex-row-reverse gap-3">
        <div
          ref={mainRef}
          role="group"
          aria-roledescription="product media gallery"
          aria-label={`${productName} photos and videos`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={openLightbox}
          className={cn(
            "relative min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-brew-2 focus-visible:ring-offset-2",
            current?.kind === "image" && "cursor-zoom-in",
          )}
          style={{ aspectRatio: "1 / 1" }}
        >
          {current?.kind === "image" ? (
            <Image
              src={current.url}
              alt={current.alt}
              width={current.width}
              height={current.height}
              priority={index === 0}
              className="h-full w-full object-contain"
            />
          ) : current?.kind === "video" ? (
            <video
              src={current.url}
              controls
              playsInline
              preload="metadata"
              aria-label={current.alt}
              className="h-full w-full object-contain bg-ink"
            />
          ) : (
            <Placeholder slot="product-packshot-generic" className="h-full w-full" />
          )}
          <span className="sr-only">
            {activeAlt}. {current?.kind === "image" ? "Press Enter to zoom." : "Use the video controls to play."} Arrow keys browse media.
          </span>
        </div>

        {count > 1 && (
          <div
            role="tablist"
            aria-label="Product media"
            className="hidden max-h-full flex-col gap-2.5 overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden"
          >
            {Array.from({ length: count }, (_, i) => Thumb(i, true))}
          </div>
        )}
      </div>

      {count > 1 && (
        <div
          role="tablist"
          aria-label="Product media"
          className="flex gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        >
          {Array.from({ length: count }, (_, i) => Thumb(i, false))}
        </div>
      )}

      <ImageLightbox
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        slides={imageSlides}
        index={current?.kind === "image" ? imageSlides.findIndex((slide) => slide.url === current.url) : 0}
        onIndexChange={(imageIndex) => {
          const activeImage = imageSlides[imageIndex];
          const galleryIndex = slides.findIndex((slide) => slide.kind === "image" && slide.url === activeImage?.url);
          if (galleryIndex >= 0) goTo(galleryIndex);
        }}
        title={activeAlt}
      />
    </div>
  );
}
