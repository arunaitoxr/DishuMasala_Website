import Image from "next/image";
import Link from "next/link";
import { Placeholder } from "@/components/media/Placeholder";
import { familyAccentVar, resolveCollectionAccent, type FamilyAccentToken } from "@/lib/family-accent";

export interface CategoryCircleItem {
  slug: string;
  title: string;
  href?: string;
  accent?: FamilyAccentToken;
  /**
   * The circle's photo. Preferably the dedicated client-supplied lifestyle shot
   * (`settings.category_circle_images`, written by scripts/migrate-category-circles.ts).
   *
   * Widened from `SectionImage` to "anything with a url" on 2026-09-17 so app/page.tsx can fall
   * back to the collection's own lead product thumbnail when no dedicated photo has been migrated
   * yet. A cropped packshot is not as good as a proper lifestyle shot — which is why the dedicated
   * photos exist and still win whenever they are present — but it is much better than the empty
   * grey disc every circle was rendering, and only `url` was ever read here anyway.
   */
  image: { url: string } | null;
}

export interface CategoryCirclesProps {
  items: readonly CategoryCircleItem[];
}

/**
 * Category circles grid at the top of the homepage:
 * Displays categories in a 2-row x 3-column grid:
 * Row 1: Blue Tea, Red Tea, Blue tea-Red Tea Combo
 * Row 2: Spices, Spices Combo, Black Tea
 *
 * Each circle carries a token-derived accent ring, lifestyle photo or placeholder,
 * and links to the relevant collection.
 */
export function CategoryCircles({ items }: CategoryCirclesProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Shop by category" className="w-full bg-surface py-6 sm:py-8 lg:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-3 gap-x-2 gap-y-7 sm:gap-x-6 sm:gap-y-8 md:grid-cols-6 md:gap-x-4 lg:gap-x-6">
          {items.map((item) => {
            const accent = familyAccentVar(item.accent ?? resolveCollectionAccent(item.slug));
            const targetHref = item.href ?? `/collections/${item.slug}/`;
            return (
              <Link
                key={`${item.slug}-${item.title}`}
                href={targetHref}
                className="group flex min-w-0 flex-col items-center gap-2.5 text-center"
              >
                <span
                  aria-hidden="true"
                  className="relative flex size-24 shrink-0 items-center justify-center rounded-full bg-surface p-[3px] shadow-card transition-[box-shadow,transform] duration-[200ms] ease-[cubic-bezier(.2,.6,.2,1)] group-hover:-translate-y-1 group-hover:shadow-lift sm:size-28 md:size-28 lg:size-32"
                  style={{ boxShadow: `0 0 0 2px ${accent}, var(--shadow-card)` }}
                >
                  <span className="relative h-full w-full overflow-hidden rounded-full bg-surface">
                    {item.image ? (
                      <Image
                        src={item.image.url}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 128px, (min-width: 640px) 112px, 96px"
                        className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                      />
                    ) : (
                      <Placeholder slot="product-packshot-generic" className="h-full w-full rounded-full" />
                    )}
                  </span>
                </span>
                <span className="flex min-h-9 w-full max-w-[118px] items-start justify-center text-xs font-semibold leading-tight text-ink sm:max-w-[140px] sm:text-sm">
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
