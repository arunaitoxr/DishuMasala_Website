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
  // One ref list per rail: they used to share one array, so the desktop rail's "keep the active
  // thumbnail in view" effect was aiming at the (hidden) mobile rail's buttons.
  const railRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const railThumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stripThumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const hasReal = slides.length > 0;
  const count = hasReal ? slides.length : 1;
  const current = hasReal ? slides[index] : null;
  const imageSlides = slides.filter((slide): slide is ImageGallerySlide => slide.kind === "image");

  const goTo = (i: number) => setIndex(((i % count) + count) % count);

  // Keeps the active thumbnail in view inside its own rail as the shopper browses with arrows or
  // swipes. Scrolls the rail itself (never `scrollIntoView`, which can also scroll the page).
  useEffect(() => {
    const rail = railRef.current;
    const railThumb = railThumbRefs.current[index];
    if (rail && railThumb) {
      const top = railThumb.offsetTop;
      const bottom = top + railThumb.offsetHeight;
      if (top < rail.scrollTop) rail.scrollTo({ top, behavior: "smooth" });
      else if (bottom > rail.scrollTop + rail.clientHeight) rail.scrollTo({ top: bottom - rail.clientHeight, behavior: "smooth" });
    }
    const strip = stripRef.current;
    const stripThumb = stripThumbRefs.current[index];
    if (strip && stripThumb) {
      strip.scrollTo({ left: stripThumb.offsetLeft - (strip.clientWidth - stripThumb.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [index]);

  // Show the rail's up/down controls only when there is somewhere to scroll in that direction.
  const updateRailScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollUp(rail.scrollTop > 4);
    setCanScrollDown(rail.scrollTop + rail.clientHeight < rail.scrollHeight - 4);
  };
  useEffect(() => {
    updateRailScroll();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateRailScroll);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [slides.length]);

  const scrollRail = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ top: direction * rail.clientHeight * 0.75, behavior: "smooth" });
  };

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
          (vertical ? railThumbRefs : stripThumbRefs).current[i] = el;
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
      {/* Reference layout (blueteaindia.co.in): a vertical thumbnail rail to the LEFT of the large
       * image on desktop, a horizontal strip below it on mobile/tablet. Both drive the same `index`.
       *
       * The square main image alone sets this block's height; the desktop rail is positioned
       * against it rather than sitting beside it in a flex row. In a row, a product with 8–9 photos
       * made the rail ~740px tall, the row stretched to match, and the square photo sat in the
       * middle of a tall frame with empty bands above and below it. Now the rail fits the image's
       * height and scrolls, with up/down controls when it overflows. */}
      <div className={cn("relative", count > 1 && "lg:pl-[88px]")}>
        {count > 1 && (
          <div className="absolute inset-y-0 left-0 hidden w-[72px] lg:block">
            <div
              ref={railRef}
              role="tablist"
              aria-orientation="vertical"
              aria-label="Product media"
              onScroll={updateRailScroll}
              className="flex h-full flex-col gap-2.5 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {Array.from({ length: count }, (_, i) => Thumb(i, true))}
            </div>
            <RailButton direction="up" visible={canScrollUp} onClick={() => scrollRail(-1)} />
            <RailButton direction="down" visible={canScrollDown} onClick={() => scrollRail(1)} />
          </div>
        )}

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
            "relative aspect-square w-full overflow-hidden rounded-lg bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-brew-2 focus-visible:ring-offset-2",
            current?.kind === "image" && "cursor-zoom-in",
          )}
        >
          {current?.kind === "image" ? (
            <Image
              src={current.url}
              alt={current.alt}
              width={current.width}
              height={current.height}
              priority={index === 0}
              sizes="(min-width: 1024px) 560px, 100vw"
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
      </div>

      {count > 1 && (
        <div
          ref={stripRef}
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

/** Up/down control over the top or bottom edge of the desktop thumbnail rail, fading the thumbnails
 * beneath it. Hidden (and out of the tab order) when the rail can't scroll that way. */
function RailButton({ direction, visible, onClick }: { direction: "up" | "down"; visible: boolean; onClick: () => void }) {
  const up = direction === "up";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 flex justify-center transition-opacity duration-[180ms]",
        up ? "top-0 bg-linear-to-b from-bg via-bg/80 to-transparent pb-5" : "bottom-0 bg-linear-to-t from-bg via-bg/80 to-transparent pt-5",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible || undefined}
        aria-label={up ? "Scroll thumbnails up" : "Scroll thumbnails down"}
        className={cn(
          "flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-surface-2",
          visible && "pointer-events-auto",
        )}
      >
        <svg viewBox="0 0 20 20" fill="none" className={cn("size-4", !up && "rotate-180")} aria-hidden="true">
          <path d="M5 12.5 10 7.5l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
