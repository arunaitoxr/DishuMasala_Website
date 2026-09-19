import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProductCarousel } from "@/components/product/ProductCarousel";
import { SectionHeading } from "./SectionHeading";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import { computeComboSavingPaise } from "@/lib/combo-savings";
import { formatINR } from "@/lib/money";
import { HOME_COPY } from "@/content/home";
import type { ProductCardData } from "@/types/catalog";

export interface ComboValueProps {
  combos: ProductCardData[];
  /** Every published spices-collection product with its variants — the raw ingredient list this
   * section matches combo names against to compute a real saving (lib/combo-savings.ts). */
  spices: ProductCardData[];
}

export function ComboValue({ combos, spices }: ComboValueProps) {
  if (combos.length === 0) return null;

  // Built server-side, as a plain object of already-rendered elements — ProductCarousel is a
  // Client Component, and a render function can't cross that boundary as a prop (only Server
  // Actions can serialize that way); a map of finished JSX keyed by slug can.
  const badgeBySlug: Record<string, React.ReactNode> = {};
  for (const combo of combos) {
    const savingPaise = computeComboSavingPaise(combo, spices);
    if (savingPaise != null) {
      badgeBySlug[combo.slug] = (
        <span
          key={`${combo.slug}-saving-badge`}
          className="absolute left-2.5 top-2.5 z-20 rounded-sm bg-ink px-2 py-1 text-xs font-semibold tabular-nums text-surface shadow-card"
        >
          Save {formatINR(savingPaise)} vs. separately
        </span>
      );
    }
  }

  return (
    <section aria-labelledby="combos-heading" className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading
          id="combos-heading"
          eyebrow={HOME_COPY.combos.eyebrow}
          heading={HOME_COPY.combos.heading}
          body={HOME_COPY.combos.body}
          accentClassName="text-chilli"
        />
        <Button asChild variant="outline" size="md" className="shrink-0 self-start lg:self-end">
          <Link href={HOME_COPY.combos.ctaHref}>{HOME_COPY.combos.ctaLabel}</Link>
        </Button>
      </div>
      <div className="mt-8">
        <ProductCarousel products={combos} label="Spice Combos" badgeBySlug={badgeBySlug} />
      </div>
    </section>
  );
}
