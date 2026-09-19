import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { HOME_COPY } from "@/content/home";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import { SectionHeading } from "./SectionHeading";

/**
 * The founder note. On the homepage it is a short "Our story" block after the products (the
 * reference site's pattern) — the question the brand began with and its answer, the tagline and the
 * founder's name — with the full six-paragraph story on /about. It used to run in full above the
 * first product, which put the first buyable card about three and a half phone screens down.
 *
 * Deliberately no photo: CLAUDE.md §8 rules out a placeholder standing in for a named person. Once a
 * real portrait exists, add it as a next/image beside this text, never through Placeholder.tsx.
 */
export function FounderStory() {
  const copy = HOME_COPY.founderStory;
  const excerpt = copy.homepageExcerpt.map((i) => copy.body[i]);

  return (
    <section aria-labelledby="founder-heading" className="bg-surface-2">
      <div className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
        <div className="max-w-3xl">
          <SectionHeading id="founder-heading" eyebrow={copy.eyebrow} heading={copy.heading} body={excerpt} accentClassName="text-ink-2" />
          <FounderSignature />
          <div className="mt-8">
            <Button asChild variant="outline" size="md">
              <Link href="/about/">Read our story</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Tagline pull-quote plus the founder's name — shared by the homepage block and /about. */
export function FounderSignature() {
  const copy = HOME_COPY.founderStory;
  return (
    <>
      <p className="mt-8 max-w-2xl border-l-2 border-gold pl-4 font-display text-base font-semibold italic text-ink sm:text-lg">
        {copy.tagline}
      </p>
      <p className="mt-4 text-sm font-semibold text-ink-2">{copy.signOff}, Founder</p>
    </>
  );
}
