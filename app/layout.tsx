import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ToastProvider } from "@/components/ui/Toast";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartUpsells } from "@/components/cart/CartUpsells";
import { FreeGiftOptionsServer } from "@/components/cart/FreeGiftOptionsServer";
import { AddDealsPopupServer } from "@/components/cart/AddDealsPopupServer";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { AccountSync } from "@/components/auth/AccountSync";
import { ServiceWorkerRegister } from "@/components/providers/ServiceWorkerRegister";
import { VisitorTracker } from "@/components/providers/VisitorTracker";
import { PhoneCapturePopup } from "@/components/marketing/PhoneCapturePopup";
import { WhatsAppButton } from "@/components/marketing/WhatsAppButton";
import { WhatsAppMessageProvider } from "@/lib/context/WhatsAppMessageContext";
import { MetaPixel } from "@/components/marketing/MetaPixel";
import { getDisplaySessionUser } from "@/lib/auth/session";
import { getSiteBranding, getStoreAddress, getWhatsAppNumber } from "@/lib/db/queries/settings";
import "./globals.css";

// Fraunces is a genuinely variable Google font (wght 100–900 plus an optical-size axis) — loading
// it without a fixed `weight` gives the full variable range next/font can serve, and `axes`
// explicitly pulls in `opsz` on top of the default `wght` axis so display sizes get the right
// optical cut, per CLAUDE.md §5.2 ("Fraunces (variable, 400–700, opsz)"). CSS then only ever
// requests 400/500/600/700 per the type scale (CLAUDE.md §5.3).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

// Inter is used at the three static weights CLAUDE.md §5.2 calls for.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Dishu Masala — Organic Indian Spices & Herbal Teas",
    template: "%s — Dishu Masala",
  },
  description:
    "Premium organic Indian spices and herbal teas from Dishu Food and Beverages, including the colour-changing Blue Tea.",
};

// Matches app/manifest.ts's background_color/theme_color (CLAUDE.md §5.2 --color-bg) so Android's
// status bar and splash screen use the same ivory ground as the site instead of flashing white.
export const viewport: Viewport = {
  themeColor: "#FCFAF6",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Resolved server-side so the header, the wishlist toggle and the cart/wishlist merge all see
  // the same session without any Supabase client running in the browser. Deliberately the cheap
  // claims-only read — it runs on every render, including every revalidatePath a server action
  // triggers — and carries no role, because this is display state, never authorization.
  const [sessionUser, whatsappNumber, storeAddress, branding] = await Promise.all([
    getDisplaySessionUser(),
    getWhatsAppNumber(),
    getStoreAddress(),
    getSiteBranding(),
  ]);

  // Site-wide Organization schema (CLAUDE.md §10) — built only from real settings rows, never an
  // invented address, phone or logo. `sameAs` is omitted entirely: Footer.tsx's own comment
  // records that no real social handle exists yet, so there is nothing truthful to put there.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const organizationJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Dishu Food and Beverages",
    url: siteUrl || undefined,
    logo: branding.logo?.url,
    ...(storeAddress
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: storeAddress.city,
            addressRegion: storeAddress.state,
            addressCountry: "IN",
          },
          contactPoint: {
            "@type": "ContactPoint",
            telephone: storeAddress.phone,
            email: storeAddress.email,
            contactType: "customer service",
          },
        }
      : {}),
  };

  return (
    <html lang="en-IN" className={`${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-surface"
        >
          Skip to content
        </a>
        <SessionProvider user={sessionUser}>
          <ToastProvider>
            <WhatsAppMessageProvider>
              <MetaPixel />
              <ServiceWorkerRegister />
              <VisitorTracker />
              <PhoneCapturePopup />
              <WhatsAppButton number={whatsappNumber} />
              <AccountSync />
              <Header />
              <main id="main-content" className="flex-1">
                {children}
              </main>
              <Footer />
              <CartDrawer upsells={<CartUpsells />} />
              <FreeGiftOptionsServer />
              <AddDealsPopupServer />
            </WhatsAppMessageProvider>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
