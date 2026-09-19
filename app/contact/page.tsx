import type { Metadata } from "next";
import { ContactForm } from "@/components/contact/ContactForm";
import { getStoreAddress, getSupportEmail, getWhatsAppNumber } from "@/lib/db/queries/settings";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Contact Us — Dishu Masala",
  description: "Get in touch with Dishu Masala — questions about an order, our products, or anything else.",
  alternates: { canonical: "/contact/" },
};

function InfoIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-5 shrink-0 text-brew-2" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The general Contact Us page — separate from the corporate/bulk-gifting page's lead-capture form
 * (app/corporate-gifting/page.tsx): that one is a sales enquiry with a quote on the other end, this
 * one is "I have a question," so it stays deliberately plain — real contact details on the left,
 * a short form on the right, no upsell rail, no trust-badge grid.
 *
 * Every detail shown is real data, never invented (CLAUDE.md §8): `storeAddress.line1`/`pincode`
 * are still the literal seeded "TODO" placeholder (lib/db/queries/settings.ts's own doc explains
 * why) and are deliberately left out of the address block below rather than rendered as-is —
 * city/state/country and the phone number are the real fields on record. Email prefers
 * `getSupportEmail()` (the client's real inbox) over `storeAddress.email`, which is also still
 * "TODO".
 */
export default async function ContactPage() {
  const [storeAddress, whatsappNumber, supportEmail] = await Promise.all([
    getStoreAddress(),
    getWhatsAppNumber(),
    getSupportEmail(),
  ]);

  const hasRealAddress = storeAddress && storeAddress.city !== "TODO" && storeAddress.state !== "TODO";
  const hasRealPhone = storeAddress && storeAddress.phone !== "TODO";

  return (
    <div className={cn(PAGE_CONTAINER, "py-12 lg:py-16")}>
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brew-2">Get in touch</p>
        <h1 className="mt-2 type-page-title text-ink">Contact Us</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">
          Questions about an order, a product, or anything else — we&apos;d love to hear from you.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          {hasRealAddress && storeAddress && (
            <div className="flex items-start gap-3">
              <InfoIcon path="M10 18s6-4.35 6-9.5A6 6 0 0 0 4 8.5C4 13.65 10 18 10 18Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <div>
                <p className="text-sm font-semibold text-ink">{storeAddress.businessName}</p>
                <p className="text-sm text-ink-2">
                  {storeAddress.city}, {storeAddress.state}, {storeAddress.country}
                </p>
              </div>
            </div>
          )}

          {hasRealPhone && storeAddress && (
            <div className="flex items-start gap-3">
              <InfoIcon path="M4.5 3.5h2.7l1.2 3.6-1.6 1.3a10.4 10.4 0 0 0 4.8 4.8l1.3-1.6 3.6 1.2v2.7c0 .8-.7 1.5-1.5 1.5A13.5 13.5 0 0 1 3 4.9c0-.8.7-1.4 1.5-1.4Z" />
              <div>
                <p className="text-sm font-semibold text-ink">Call us</p>
                <a href={`tel:${storeAddress.phone.replace(/\s+/g, "")}`} className="text-sm text-ink-2 hover:text-ink hover:underline">
                  {storeAddress.phone}
                </a>
              </div>
            </div>
          )}

          {supportEmail && (
            <div className="flex items-start gap-3">
              <InfoIcon path="M3.5 5.5h13v9h-13v-9Zm0 0 6.5 5 6.5-5" />
              <div>
                <p className="text-sm font-semibold text-ink">Email us</p>
                <a href={`mailto:${supportEmail}`} className="text-sm text-ink-2 hover:text-ink hover:underline">
                  {supportEmail}
                </a>
              </div>
            </div>
          )}

          {whatsappNumber && (
            <div className="flex items-start gap-3">
              <InfoIcon path="M4 16.5 5 13a6.5 6.5 0 1 1 2.5 2.5L4 16.5Z" />
              <div>
                <p className="text-sm font-semibold text-ink">WhatsApp</p>
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi Dishu Masala, I have a question.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-2 hover:text-ink hover:underline"
                >
                  Chat with us
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-card sm:p-8">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
