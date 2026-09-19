"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Image from "next/image";
import { Placeholder } from "@/components/media/Placeholder";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import type { ImageGallerySlide } from "./Gallery";

interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: ImageGallerySlide[];
  index: number;
  onIndexChange: (index: number) => void;
  title: string;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
      <path
        d={direction === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A dedicated lightbox rather than the shared components/ui/Dialog — that component hardcodes a
 * `max-w-md` width and a subtle 200ms "settle" animation tuned for small utility dialogs (a refund
 * note, a cancel confirmation), both wrong for a full-image viewer. This gets its own richer open
 * animation (`lightbox-in`, app/globals.css) and an actual sliding filmstrip between photos — every
 * slide sits side by side in one flex row that translates, so moving to the next photo is one
 * continuous motion rather than a hard image swap. `prefers-reduced-motion` still collapses all of
 * it via globals.css's generic `*` override; nothing here needs its own guard.
 */
export function ImageLightbox({ open, onOpenChange, slides, index, onIndexChange, title }: ImageLightboxProps) {
  const count = slides.length || 1;
  const goTo = (i: number) => onIndexChange(((i % count) + count) % count);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* No backdrop-blur here: animating opacity on a `backdrop-filter` forces the browser to
            recompute the blur over the whole page on every frame, and doing that at the exact
            moment the panel below is also scaling in is exactly what read as a "jerk" opening
            the lightbox. A plain dimmed overlay composites on the GPU with none of that cost. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/60 data-[state=open]:animate-[fade-in_280ms_ease]" />
        {/* Centering via a flex wrapper, not `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`
            on the panel itself — that percentage-based transform depends on the panel's OWN
            width, which the browser can settle a frame or two after paint starts, and watching it
            resolve is exactly what reads as "opens top-right, then jerks to center". A flexbox
            wrapper centers its child through layout, not a width-dependent transform, so there is
            nothing to visibly resolve — and it also means the open animation only needs `scale`,
            not `translate(-50%,-50%) scale(...)`, since the element is never offset to begin
            with. `pointer-events-none` on the wrapper (with `pointer-events-auto` back on the
            panel) keeps a click on the empty margin around the panel falling through to the
            Overlay above, so click-outside-to-close still works. */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <DialogPrimitive.Content
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                goTo(index + 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                goTo(index - 1);
              }
            }}
            className="pointer-events-auto w-full max-w-3xl rounded-lg bg-surface p-2 shadow-lift will-change-transform focus:outline-none data-[state=open]:animate-[lightbox-in_380ms_cubic-bezier(.16,1,.3,1)]"
          >
            <VisuallyHidden>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            </VisuallyHidden>

            <div className="relative w-full overflow-hidden rounded-md bg-surface-2" style={{ aspectRatio: "1 / 1" }}>
            <div
              className="flex h-full transition-transform duration-[420ms] ease-[cubic-bezier(.16,1,.3,1)]"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {slides.length > 0 ? (
                slides.map((slide, i) => {
                  // Only decode the current slide and its immediate neighbours (wrapping) — with
                  // 5-7 photos in a product gallery, mounting every <Image> at once means the
                  // browser tries to decode all of them the instant the dialog opens, right when
                  // it's also busy running the open animation. Loading just what's reachable by
                  // one click either way keeps that decode work small without ever showing a
                  // blank frame while sliding.
                  const distance = Math.min((i - index + count) % count, (index - i + count) % count);
                  return (
                    <div key={i} className="relative h-full w-full shrink-0">
                      {distance <= 1 ? (
                        <Image
                          src={slide.url}
                          alt={slide.alt}
                          fill
                          sizes="(min-width: 768px) 768px, 100vw"
                          className="object-contain"
                        />
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="relative h-full w-full shrink-0">
                  <Placeholder slot="product-packshot-generic" className="h-full w-full" />
                </div>
              )}
            </div>

            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => goTo(index - 1)}
                  className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-card transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brew-2 focus-visible:ring-offset-2"
                >
                  <ChevronIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => goTo(index + 1)}
                  className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-card transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brew-2 focus-visible:ring-offset-2"
                >
                  <ChevronIcon direction="right" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {slides.map((_, i) => (
                    <span
                      key={i}
                      className={`size-1.5 rounded-full transition-colors duration-200 ${i === index ? "bg-ink" : "bg-ink/25"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brew-2"
            >
              <CloseIcon />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
