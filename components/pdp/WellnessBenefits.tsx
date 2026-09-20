import type { ReactNode } from "react";
import { parseWellnessBenefits } from "@/lib/pdp/parse-description";

/**
 * The Blue Tea / Red Tea "wellness & benefits" block, laid out the way bluetea.co.in presents theirs: an
 * eyebrow and heading, the intro line, one light-blue card per benefit with an icon, and the closing
 * usage line as a callout. The words are the client's own copy from the product's "Health Benefits"
 * description block, unaltered — sits in the buy column between the add-to-cart row and the trust badges, rendered only for the Blue Tea and Red Tea products, where the client
 * supplied it (see lib/pdp/parse-description.ts). Icons are picked by keyword and are
 * decorative; the card text carries the meaning.
 */
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-6",
} as const;

const ICONS = {
  scale: (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 9.5a4 4 0 0 1 8 0M12 9.5l1.6-1.8" />
    </svg>
  ),
  flame: (
    <svg {...ICON_PROPS}>
      <path d="M12 3c.6 3 4.5 4.8 4.5 9a4.5 4.5 0 0 1-9 0c0-1.7.8-2.8 1.6-3.7.3 1.2 1 1.7 1.7 1.7C11 7.5 11 5 12 3Z" />
    </svg>
  ),
  leaf: (
    <svg {...ICON_PROPS}>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c2-4 5-7 9-9" />
    </svg>
  ),
  drop: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5c3.2 4 5.5 6.6 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3 2.3-5.6 5.5-9.6Z" />
    </svg>
  ),
  cup: (
    <svg {...ICON_PROPS}>
      <path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9ZM16 10h1.5a2 2 0 0 1 0 4H16M9 4.5c0 1 1 1 1 2M12.5 4.5c0 1 1 1 1 2" />
    </svg>
  ),
  heart: (
    <svg {...ICON_PROPS}>
      <path d="M12 19.5s-7-4.4-8.6-8.6C2.3 8 3.9 4.8 7 4.5c1.9-.2 3.5.8 5 2.6 1.5-1.8 3.1-2.8 5-2.6 3.1.3 4.7 3.5 3.6 6.4-1.6 4.2-8.6 8.6-8.6 8.6Z" />
    </svg>
  ),
  shield: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.2 7 9 4.1-1.8 7-4.8 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </svg>
  ),
  sparkle: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5c.7 4 2.5 5.8 6.5 6.5-4 .7-5.8 2.5-6.5 6.5-.7-4-2.5-5.8-6.5-6.5 4-.7 5.8-2.5 6.5-6.5ZM18.5 16.5v3M17 18h3" />
    </svg>
  ),
  check: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.3 2.4 2.4 4.6-5" />
    </svg>
  ),
} satisfies Record<string, ReactNode>;

function iconFor(label: string): ReactNode {
  if (/blood|heart/i.test(label)) return ICONS.heart;
  if (/immun/i.test(label)) return ICONS.shield;
  if (/collagen|skin|hair/i.test(label)) return ICONS.sparkle;
  if (/cholesterol/i.test(label)) return ICONS.drop;
  if (/weight|fat/i.test(label)) return ICONS.scale;
  if (/crav|metabolism/i.test(label)) return ICONS.flame;
  if (/digest|bloat|gut/i.test(label)) return ICONS.leaf;
  if (/toxin|detox|cleans/i.test(label)) return ICONS.drop;
  if (/caffeine|keto/i.test(label)) return ICONS.cup;
  return ICONS.check;
}

export function WellnessBenefits({ text, heading }: { text: string; heading: string }) {
  const { intro, benefits, note } = parseWellnessBenefits(text);
  if (benefits.length === 0 && !intro) return null;

  return (
    <section aria-labelledby="wellness-heading" className="mt-3 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="type-eyebrow text-brew-2">Wellness &amp; benefits</p>
        <h2 id="wellness-heading" className="font-display text-2xl font-semibold tracking-tight text-ink">
          {heading}
        </h2>
        {intro && <p className="text-sm leading-relaxed text-ink-2">{intro}</p>}
      </div>

      {benefits.length > 0 && (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3 rounded-xl bg-brew-1/10 p-3 sm:last:odd:col-span-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-brew-2 shadow-card">
                {iconFor(benefit)}
              </span>
              <span className="text-sm font-medium leading-snug text-ink">{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p className="rounded-xl border border-brew-1/20 bg-surface p-3.5 text-sm leading-relaxed text-ink-2">{note}</p>
      )}
    </section>
  );
}
