import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { RitualVideo } from "./RitualVideo";
import { SectionHeading } from "./SectionHeading";
import { HOME_COPY } from "@/content/home";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

/** The brew + lemon ritual teaser — story and SEO (the full recipe is real seeded content in Phase
 * 8; this section links to it ahead of time). No health or medicinal claims, only the brewing
 * steps and the colour-change mechanic already described in the client's own product copy. */
export function RitualTeaser() {
  const copy = HOME_COPY.ritual;

  return (
    <section aria-labelledby="ritual-heading" className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
        <div className="flex flex-col gap-6">
          <SectionHeading
            id="ritual-heading"
            eyebrow={copy.eyebrow}
            heading={copy.heading}
            body={copy.body}
          />
          <div>
            <Button asChild variant="outline" size="md">
              <Link href={copy.ctaHref}>{copy.ctaLabel}</Link>
            </Button>
          </div>
        </div>
        <RitualVideo className="rounded-lg" />
      </div>
    </section>
  );
}
