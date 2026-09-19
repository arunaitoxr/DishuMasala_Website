import Image from "next/image";
import Link from "next/link";
import { getCollectionsWithStats } from "@/lib/db/queries/collections";
import { getGstin, getSiteBranding, getStoreAddress } from "@/lib/db/queries/settings";
import { NewsletterFormLazy } from "./NewsletterFormLazy";

const POLICY_LINKS = [
  { href: "/privacy/", label: "Privacy Policy" },
  { href: "/terms/", label: "Terms of Service" },
  { href: "/refund-policy/", label: "Refund Policy" },
  { href: "/shipping-policy/", label: "Shipping Policy" },
];

const PAYMENT_BADGES = ["Razorpay", "UPI", "Cards", "Netbanking"];

function formatAddressLine(city: string, state: string): string {
  return `${city}, ${state}`;
}

export async function Footer() {
  const [collections, storeAddress, gstin, branding] = await Promise.all([
    getCollectionsWithStats(),
    getStoreAddress(),
    getGstin(),
    getSiteBranding(),
  ]);

  return (
    <footer className="mt-16 bg-surface-2">
      {/* A single 1px gold hairline, not the full lemon-shift gradient (design-review call: the
       * gradient already lands as the homepage's full-bleed section journey — repeating it as a
       * footer bar read as a leftover rainbow rather than a deliberate accent, and diluted the
       * "one showpiece, then a restrained accent system" discipline). The hairline is the
       * CLAUDE.md §5.2 --color-gold token, the same "premium hairline" device used elsewhere. */}
      <div aria-hidden="true" className="h-px w-full bg-gold/60" />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="flex flex-col items-start gap-4">
          {branding.logo ? (
            <Image
              src={branding.logo.url}
              alt={branding.logo.alt}
              width={Math.round((branding.logo.width / branding.logo.height) * 28)}
              height={28}
              className="h-7 w-auto object-contain"
            />
          ) : (
            <p className="font-display text-lg font-semibold text-ink">Dishu Masala</p>
          )}
          {storeAddress ? (
            <address className="not-italic text-sm leading-relaxed text-ink-2">
              {storeAddress.businessName}
              <br />
              {formatAddressLine(storeAddress.city, storeAddress.state)}
              <br />
              <a href={`tel:${storeAddress.phone.replace(/\s+/g, "")}`} className="hover:text-ink">
                {storeAddress.phone}
              </a>
              <br />
              <a href={`mailto:${storeAddress.email.toLowerCase()}`} className="hover:text-ink">
                {storeAddress.email.toLowerCase()}
              </a>
            </address>
          ) : (
            <p className="text-sm text-ink-2">Contact details unavailable.</p>
          )}
          {/* Social icons return once real profile URLs exist. They used to render as inert
              "coming soon" circles that looked like working links (CLAUDE.md §8: no invented URLs). */}
        </div>

        <div>
          <p className="type-eyebrow mb-3 text-ink-2">Shop</p>
          <ul className="flex flex-col gap-2">
            {collections.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}/`} className="text-sm text-ink-2 hover:text-ink">
                  {c.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/corporate-gifting/" className="text-sm text-ink-2 hover:text-ink">
                Corporate & Bulk Gifting
              </Link>
            </li>
            <li>
              <Link href="/about/" className="text-sm text-ink-2 hover:text-ink">
                Our story
              </Link>
            </li>
            <li>
              <Link href="/contact/" className="text-sm text-ink-2 hover:text-ink">
                Contact us
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="type-eyebrow mb-3 text-ink-2">Policies</p>
          <ul className="flex flex-col gap-2">
            {POLICY_LINKS.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="text-sm text-ink-2 hover:text-ink">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-6">
          <NewsletterFormLazy />
          <div>
            <p className="type-eyebrow mb-2.5 text-ink-2">Payment options</p>
            <ul className="flex flex-wrap gap-1.5">
              {PAYMENT_BADGES.map((b) => (
                <li
                  key={b}
                  className="rounded-sm border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-2"
                >
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-ink-2 sm:px-6">
          <p>
            All prices are inclusive of GST{gstin ? ` — GSTIN ${gstin}` : ""}.
          </p>
          <p>&copy; {new Date().getFullYear()} Dishu Food and Beverages. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
