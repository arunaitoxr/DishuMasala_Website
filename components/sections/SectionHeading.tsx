import { cn } from "@/lib/cn";

export interface SectionHeadingProps {
  id: string;
  /** Short label above the title. Optional — a title that already names its subject ("Frequently
   * asked questions", "Reviews") doesn't need one repeating it. */
  eyebrow?: string;
  heading: string;
  /** A single paragraph, or an array rendered as separate paragraphs (client-requested line
   * breaks — e.g. Red Tea's "Bright • Floral • Mildly Tart • Caffeine-Free" on its own line). */
  body?: string | readonly string[];
  /** Eyebrow colour — a token utility class (e.g. "text-brew-2", "text-hibiscus"). Must clear 4.5:1
   * on ivory at this size (CLAUDE.md §5.6): brew-2, hibiscus, leaf, chilli, pepper, ink and ink-2 do;
   * turmeric, coriander and gold do not. */
  accentClassName?: string;
  align?: "left" | "center";
  className?: string;
  /** "dark" (default) is ink text on ivory. "light" is white text on a saturated colour band. */
  tone?: "dark" | "light";
  /** The page's own title uses `h1` (and the page-title size); every section below it is `h2`. */
  as?: "h1" | "h2";
}

/**
 * The one heading block every section on the storefront uses — homepage bands, collection pages,
 * the product page's lower sections, gifting, FAQ, reviews — so the type scale (CLAUDE.md §5.3)
 * stays identical everywhere instead of each component re-typing its own clamp() (they had drifted
 * to 18px, 30px and 43px section titles on the same site).
 */
export function SectionHeading({
  id,
  eyebrow,
  heading,
  body,
  accentClassName = "text-brew-2",
  align = "left",
  className,
  tone = "dark",
  as: Tag = "h2",
}: SectionHeadingProps) {
  const isLight = tone === "light";
  const paragraphs = body == null ? [] : Array.isArray(body) ? body : [body];
  return (
    <div className={cn("flex flex-col gap-3", align === "center" && "items-center text-center", className)}>
      {eyebrow && <p className={cn("type-eyebrow", isLight ? "text-white/80" : accentClassName)}>{eyebrow}</p>}
      <Tag
        id={id}
        className={cn(Tag === "h1" ? "type-page-title" : "type-section-title", isLight ? "text-white" : "text-ink")}
      >
        {heading}
      </Tag>
      {paragraphs.length > 0 && (
        <div className={cn("flex max-w-2xl flex-col gap-3", align === "left" && "copy-justify")}>
          {paragraphs.map((paragraph, i) => (
            <p key={i} className={cn("text-base leading-relaxed", isLight ? "text-white/90" : "text-ink-2")}>
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
