import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import { SectionHeading } from "./SectionHeading";

/**
 * A centred heading over a row of pill badges on the neutral band — first built for Corporate
 * Gifting ("Why brands choose Dishu"), now also the trust section on every collection page, so both
 * page types close the same way. Only claims this project can stand behind (CLAUDE.md §8): no
 * invented customer counts, awards, press or certifications.
 */
export function TrustBand({ id, heading, badges }: { id: string; heading: string; badges: readonly string[] }) {
  if (badges.length === 0) return null;
  return (
    <section aria-labelledby={id} className="bg-surface-2">
      <div className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
        <SectionHeading id={id} heading={heading} align="center" />
        <ul className="mx-auto mt-8 flex max-w-5xl flex-wrap items-center justify-center gap-3">
          {badges.map((badge) => (
            <li key={badge} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2">
              {badge}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
