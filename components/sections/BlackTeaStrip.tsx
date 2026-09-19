import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProductCarousel } from "@/components/product/ProductCarousel";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { HOME_COPY } from "@/content/home";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import type { ProductCardData } from "@/types/catalog";

/**
 * Black Tea on the homepage — the same heading block, CTA and carousel as every other product
 * section. It used to be deliberately quieter (an 18px heading, no eyebrow, no button), which read
 * as a different template rather than as a secondary section.
 */
export function BlackTeaStrip({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) return null;
  const copy = HOME_COPY.blackTea;

  return (
    <section aria-labelledby="black-tea-heading" className="bg-surface-2">
      <div className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading id="black-tea-heading" eyebrow={copy.eyebrow} heading={copy.heading} body={copy.body} accentClassName="text-leaf" />
          <Button asChild variant="outline" size="md" className="shrink-0 self-start lg:self-end">
            <Link href={copy.ctaHref}>{copy.ctaLabel}</Link>
          </Button>
        </div>
        <div className="mt-8">
          <ProductCarousel products={products} label="Black Tea products" />
        </div>
      </div>
    </section>
  );
}
