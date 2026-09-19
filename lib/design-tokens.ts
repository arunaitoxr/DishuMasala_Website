/**
 * A read-only mirror of the hex values in app/globals.css's `@theme` block. This is the one
 * deliberate, documented exception to "no hex literals" — for the narrow set of contexts that
 * genuinely cannot consume a CSS custom property, because nothing on the page's own DOM/CSS ever
 * runs: app/design-system/page.tsx's real WCAG contrast arithmetic; next/og's Satori renderer
 * (app/product/[slug]/opengraph-image.tsx), which paints to an image buffer, not a browser; and
 * third-party SDK config objects that take a literal colour string, not a class or a var()
 * (components/checkout/RazorpayButton.tsx's `theme.color`, rendered inside Razorpay's own iframe).
 * Every other component keeps referencing the CSS variable/utility class as normal — this file
 * exists so those few exceptions have one canonical source instead of each re-typing its own copy
 * of the same hex values.
 *
 * If a value here ever drifts from app/globals.css, every one of the above goes wrong quietly —
 * keep the two in sync by hand until there's a build step that generates one from the other.
 */
export const DESIGN_TOKEN_HEX = {
  "bg": "#FCFAF6",
  "surface": "#FFFFFF",
  "surface-2": "#F5F1EA",
  "line": "#E7E1D8",
  "ink": "#17161A",
  "ink-2": "#4A4750",
  "ink-3": "#7C7885",
  "brew-1": "#123FA8",
  "brew-2": "#2E5BE0",
  "brew-3": "#6C3FD1",
  "brew-4": "#A62D9B",
  "brew-5": "#D62A6B",
  "citrus": "#F3C623",
  "hibiscus": "#C0263C",
  "leaf": "#2F6B4F",
  "turmeric": "#E39A1F",
  "chilli": "#C43B23",
  "coriander": "#7C8F45",
  "pepper": "#37342F",
  "ok": "#2F6B4F",
  "warn": "#B7791F",
  "crit": "#B4232E",
  "gold": "#B08D3F",
} as const;

export type DesignTokenName = keyof typeof DESIGN_TOKEN_HEX;

/**
 * Section vertical rhythm — the one scale every homepage/landing section uses.
 *
 * Added 2026-09-17. Before this the homepage ran five competing rhythms (`py-32` on the three
 * colour bands, `py-24` on FounderStory, `py-20`, `py-16`, `py-14`, `py-10`), which is most of why
 * the page measured 11,012px against the reference site's 6,094px, and why the bands showed large
 * empty runs of colour above and below their content.
 *
 * Mobile-first: the base value is the phone value and each step only grows from there. Three steps,
 * deliberately — a fourth would just re-open the drift this replaces.
 *
 * - `COMPACT`  strips and rails that sit between larger sections (category circles, logo strips)
 * - `SECTION`  the default for ordinary content sections
 * - `BAND`     full-bleed colour/editorial bands that genuinely need more air around them
 *
 * Applied as a plain class string so it composes with `cn()` and stays greppable:
 *   <section className={cn(SECTION_SPACING.BAND, "bg-brew-2")}>
 */
export const SECTION_SPACING = {
  COMPACT: "py-8 sm:py-10",
  SECTION: "py-12 sm:py-14 lg:py-16",
  BAND: "py-14 sm:py-16 lg:py-20",
} as const;

export type SectionSpacingName = keyof typeof SECTION_SPACING;

/**
 * The one page container — every storefront page and section aligns its content to the header's
 * edge (logo on the left, icons on the right). Before this, the cart, blog and recipes used
 * `max-w-5xl` and contact `max-w-6xl`, so the page's left edge jumped as you moved between pages.
 * Narrower reading measures (a form, an article) sit *inside* this container, left-aligned to it,
 * rather than re-centring on a narrower one.
 */
export const PAGE_CONTAINER = "mx-auto w-full max-w-7xl px-4 sm:px-6";
