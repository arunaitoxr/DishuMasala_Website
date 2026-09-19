import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { parseProductDescription } from "@/lib/pdp/parse-description";
import { formatINR } from "@/lib/money";
import type { Paise } from "@/lib/money";

export interface DetailsProps {
  description: string | null;
  freeShippingThresholdPaise: Paise;
  /** Gates the "Wellness Benefits" accordion (see this file's other comment) — true only for the
   * two Blue Tea product slugs the client explicitly confirmed this copy for. Every other
   * product's own "Health Benefits" text stays parsed-but-unrendered, same as before. */
  showHealthBenefits?: boolean;
}

/** Renders multi-line block text as real paragraphs — a plain `\n`-joined string, never markup. */
function BlockText({ text }: { text: string }) {
  return (
    <div className="copy-justify flex flex-col gap-1.5 text-sm leading-relaxed text-ink-2">
      {text.split("\n").map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

/**
 * Accordions built from the product's own stored `description` copy (Key Characteristics,
 * Ingredients, How to brew / How to use) plus one generic, identical-on-every-PDP Shipping &
 * Returns accordion (PROMPTS.md Phase 4 item 5). "Health Benefits" is parsed by
 * lib/pdp/parse-description.ts but rendered only when `showHealthBenefits` is true — CLAUDE.md §8
 * bans this project from authoring health claims on its own initiative, so this stays off by
 * default; it's on only for the two Blue Tea products, where the client supplied this exact copy
 * and confirmed using it twice (see parse-description.ts's header comment for the full log).
 */
export function Details({ description, freeShippingThresholdPaise, showHealthBenefits = false }: DetailsProps) {
  const parsed = parseProductDescription(description);
  const defaultOpen: string[] = [];
  if (parsed.keyCharacteristics) defaultOpen.push("characteristics");

  return (
    <section aria-labelledby="pdp-details-heading">
      {/* Radix's Accordion.Header renders each trigger's wrapper as an <h3> — this h2 keeps the
       * page's heading order sequential (h1 product name → h2 → h3 accordion triggers) rather
       * than jumping straight from the PDP's h1 to h3 (a real axe/Lighthouse a11y violation this
       * bridges, not decoration). */}
      <h2 id="pdp-details-heading" className="mb-1 font-display text-lg font-semibold text-ink">
        Details
      </h2>
      <Accordion type="multiple" defaultValue={defaultOpen}>
        {parsed.keyCharacteristics && (
          <AccordionItem value="characteristics">
            <AccordionTrigger>Key Characteristics</AccordionTrigger>
            <AccordionContent>
              <BlockText text={parsed.keyCharacteristics} />
            </AccordionContent>
          </AccordionItem>
        )}

        {parsed.ingredients && (
          <AccordionItem value="ingredients">
            <AccordionTrigger>Ingredients</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm leading-relaxed text-ink-2">{parsed.ingredients}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {parsed.howToUse && (
          <AccordionItem value="how-to-use">
            <AccordionTrigger>How to brew / How to use</AccordionTrigger>
            <AccordionContent>
              <BlockText text={parsed.howToUse} />
            </AccordionContent>
          </AccordionItem>
        )}

        {showHealthBenefits && parsed.healthBenefits && (
          <AccordionItem value="wellness-benefits">
            <AccordionTrigger>Wellness Benefits</AccordionTrigger>
            <AccordionContent>
              <BlockText text={parsed.healthBenefits} />
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="shipping-returns">
          <AccordionTrigger>Shipping &amp; Returns</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-2">
              <p>Free shipping on orders over {formatINR(freeShippingThresholdPaise)}.</p>
              {/* Links to the real policy pages rather than restating a returns window here —
               * CLAUDE.md §8 bans inventing a figure the client hasn't supplied. This used to say the
               * policy "will appear here shortly" after those pages already existed. */}
              <p>
                Read our{" "}
                <Link href="/shipping-policy/" className="font-medium text-ink underline underline-offset-4">
                  shipping policy
                </Link>{" "}
                and{" "}
                <Link href="/refund-policy/" className="font-medium text-ink underline underline-offset-4">
                  refund policy
                </Link>
                , or{" "}
                <Link href="/contact/" className="font-medium text-ink underline underline-offset-4">
                  contact us
                </Link>{" "}
                about an order.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
