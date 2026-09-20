export interface MarqueeItem {
  icon?: React.ReactNode;
  label: string;
}

/**
 * A continuously scrolling marquee strip — extracted from `TrustStrip` (Phase 2/homepage work) so
 * the Spices section's separator (client request) can reuse the exact same pattern instead of a
 * second copy of the marquee markup/CSS. Pure CSS (`.trust-marquee-track` in app/globals.css) — no
 * JavaScript needed to render or animate it — pauses on hover/focus, and freezes to a static,
 * finished list under `prefers-reduced-motion: reduce` (that media query is handled entirely in
 * the shared CSS, not per-caller).
 */
const SOLID_TONES = { blue: "border-brew-1 bg-brew-1", red: "border-hibiscus bg-hibiscus" } as const;

export function MarqueeStrip({
  ariaLabel,
  items,
  className,
  tone = "cream",
}: {
  ariaLabel: string;
  items: MarqueeItem[];
  className?: string;
  /** "cream" (default) — ivory strip, muted ink text. "blue" (deep butterfly-pea, ~9:1 white on
   * --color-brew-1) and "red" (hibiscus, ~5.9:1 white on --color-hibiscus) — a solid collection-colour
   * strip with white text. */
  tone?: "cream" | "blue" | "red";
}) {
  const solid = tone === "cream" ? null : SOLID_TONES[tone];
  function list(ariaHidden: boolean) {
    return (
      <ul aria-hidden={ariaHidden || undefined} className={`flex shrink-0 items-center ${ariaHidden ? "trust-marquee-duplicate" : ""}`}>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2.5 px-6 py-3 sm:px-8">
            {item.icon}
            <span className={`whitespace-nowrap text-sm font-medium ${solid ? "text-white" : "text-ink-2"}`}>{item.label}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label={ariaLabel} className={`overflow-hidden border-y ${solid ?? "border-line bg-surface-2"} ${className ?? ""}`}>
      <div className="trust-marquee-track">
        {list(false)}
        {list(true)}
      </div>
    </section>
  );
}
