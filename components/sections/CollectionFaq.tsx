import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { COLLECTION_FAQS, buildSharedCommerceFaqs, type FaqItem } from "@/content/faq";
import { getFreeShippingThresholdPaise } from "@/lib/db/queries/settings";
import { formatINR } from "@/lib/money";
import { PAGE_CONTAINER, SECTION_SPACING } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";
import { SectionHeading } from "./SectionHeading";

export interface CollectionFaqProps {
  collectionSlug: string;
  collectionTitle: string;
}

/** Collection FAQ — laid out like the Corporate Gifting page's closing section (centred heading,
 * content on one white card), which is now the shared closing section for the homepage, every
 * collection page and every product page. Real Q&A (grounded in content/faq.ts, "invent nothing" per CLAUDE.md §8) plus
 * FAQPage JSON-LD (CLAUDE.md §10 lists FAQPage among the required structured-data types). Shipping
 * questions read the live free-shipping threshold from `settings` rather than a hardcoded ₹500. */
export async function CollectionFaq({ collectionSlug, collectionTitle }: CollectionFaqProps) {
  const collectionFaqs = COLLECTION_FAQS[collectionSlug];
  if (!collectionFaqs) return null;

  const freeShippingThresholdPaise = await getFreeShippingThresholdPaise();
  const faqs: FaqItem[] = [...collectionFaqs, ...buildSharedCommerceFaqs(formatINR(freeShippingThresholdPaise))];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <section aria-labelledby="collection-faq-heading" className={cn(PAGE_CONTAINER, SECTION_SPACING.SECTION)}>
      <SectionHeading
        id="collection-faq-heading"
        heading="Frequently asked questions"
        body={`Everything you need to know about ${collectionTitle}.`}
        align="center"
      />
      <div className="mx-auto mt-8 max-w-3xl rounded-lg border border-line bg-surface px-5 shadow-card sm:px-8">
        <Accordion type="single" collapsible>
          {faqs.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
