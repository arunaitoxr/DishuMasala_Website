import type { Metadata } from "next";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { FounderSignature } from "@/components/sections/FounderStory";
import { HOME_COPY } from "@/content/home";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Our story",
  description: "Why Dishu Masala exists — clean masalas and herbal teas, made to the standard a father set for his daughter.",
  alternates: { canonical: "/about/" },
};

/** The full founder story. The homepage shows a two-paragraph excerpt and links here. */
export default function AboutPage() {
  const copy = HOME_COPY.founderStory;
  return (
    <div className={cn(PAGE_CONTAINER, "py-12 sm:py-16")}>
      <article className="max-w-3xl">
        <SectionHeading as="h1" id="about-heading" eyebrow={copy.eyebrow} heading={copy.heading} body={copy.body} accentClassName="text-ink-2" />
        <FounderSignature />
      </article>
    </div>
  );
}
