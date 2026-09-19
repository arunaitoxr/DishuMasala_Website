import Image, { type StaticImageData } from "next/image";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PAGE_CONTAINER } from "@/lib/design-tokens";

export interface PageHeroImage {
  src: string | StaticImageData;
  alt: string;
  width: number;
  height: number;
}

export interface PageHeroProps {
  ariaLabel: string;
  eyebrow: string;
  heading: string;
  subhead?: string | null;
  /** Optional — a page whose content starts right below (All products) doesn't need a jump link. */
  cta?: { label: string; href: string };
  /** The wide artwork, shown from `lg` up with the copy over its open left side. `null` renders the
   * copy on the colour band alone, at every width (a page with no supplied artwork yet). */
  image: PageHeroImage | null;
  /** Portrait artwork for phones and tablets; falls back to `image`. */
  mobileImage?: PageHeroImage | null;
  /** "dark" — white copy over a dark photo (the gifting hamper). "light" — ink copy over the bright,
   * open side of a studio banner (the collection pages). */
  tone?: "dark" | "light";
  /** Token background for the copy band below the image on phones, and for an image-less hero —
   * e.g. "bg-brew-1". Must carry white text at 4.5:1. */
  bandClassName: string;
}

/**
 * The one page hero, shared by Corporate Gifting and every collection page (client brief,
 * 2026-09-20: "make the category pages look like Corporate Gifting"). Same frame height, same copy
 * position, same type roles and the same button everywhere, so moving between these pages feels like
 * one site rather than one template per page.
 *
 *  - **Desktop (`lg`+)**: artwork full-bleed; eyebrow, title, subhead and CTA sit in the artwork's own
 *    open left side, over a scrim that stops before the midpoint so the packs on the right stay clear.
 *  - **Phones/tablets**: the portrait artwork (capped at 70% of the viewport so the copy is never
 *    pushed off the first screen), then the copy on a solid colour band — a narrow crop has no
 *    reliable empty area to put text on.
 */
export function PageHero({
  ariaLabel,
  eyebrow,
  heading,
  subhead,
  cta,
  image,
  mobileImage,
  tone = "dark",
  bandClassName,
}: PageHeroProps) {
  const phoneImage = mobileImage ?? image;
  const isLight = tone === "light";

  const band = (
    <div className={cn(bandClassName, "text-white")}>
      <div className={cn(PAGE_CONTAINER, "py-10 text-center", !image && "lg:py-20 lg:text-left")}>
        <div className={cn("mx-auto max-w-md", !image && "lg:mx-0")}>
          <HeroCopy eyebrow={eyebrow} heading={heading} subhead={subhead} cta={cta} light={false} />
        </div>
      </div>
    </div>
  );

  if (!image) {
    return (
      <section aria-label={ariaLabel} className="w-full">
        {band}
      </section>
    );
  }

  return (
    <section aria-label={ariaLabel} className="relative w-full">
      <div className="relative hidden h-[clamp(560px,50vw,720px)] w-full overflow-hidden lg:block">
        <Image src={image.src} alt={image.alt} fill priority sizes="100vw" className="object-cover" />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: isLight
              ? "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 88%, transparent) 0%, color-mix(in srgb, var(--color-bg) 60%, transparent) 30%, transparent 55%)"
              : "linear-gradient(90deg, rgb(0 0 0 / .72) 0%, rgb(0 0 0 / .45) 32%, transparent 58%)",
          }}
        />
        <div className={cn(PAGE_CONTAINER, "relative flex h-full items-center")}>
          <div className="max-w-md">
            <HeroCopy eyebrow={eyebrow} heading={heading} subhead={subhead} cta={cta} light={isLight} />
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        {phoneImage && (
          <div
            className="relative max-h-[70vh] w-full overflow-hidden"
            style={{ aspectRatio: `${phoneImage.width} / ${phoneImage.height}` }}
          >
            <Image src={phoneImage.src} alt={phoneImage.alt} fill priority sizes="100vw" className="object-cover" />
          </div>
        )}
        {band}
      </div>
    </section>
  );
}

function HeroCopy({
  eyebrow,
  heading,
  subhead,
  cta,
  light,
}: Pick<PageHeroProps, "eyebrow" | "heading" | "subhead" | "cta"> & { light: boolean }) {
  return (
    <>
      <p className={cn("type-eyebrow", light ? "text-ink-2" : "text-white/85")}>{eyebrow}</p>
      <h1 className={cn("type-page-title mt-3", light ? "text-ink" : "text-white")}>{heading}</h1>
      {subhead && <p className={cn("mt-4 text-base leading-relaxed", light ? "text-ink-2" : "text-white/90")}>{subhead}</p>}
      {cta && (
        <div className="mt-7">
          <Button asChild variant={light ? "solid-ink" : "solid-surface"} size="lg">
            <a href={cta.href}>{cta.label}</a>
          </Button>
        </div>
      )}
    </>
  );
}
