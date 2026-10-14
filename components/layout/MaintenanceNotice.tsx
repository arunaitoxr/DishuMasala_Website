import Image from "next/image";
import type { SiteBranding, StoreAddress } from "@/lib/db/queries/settings";

/**
 * What shoppers see while Admin → Settings → Maintenance mode is on: the shop is closed for a short
 * while, with real ways to reach the store (from settings, never invented). Staff still see the full
 * site (app/layout.tsx) and the admin and sign-in pages stay reachable.
 */
export function MaintenanceNotice({
  branding,
  storeAddress,
  whatsappNumber,
}: {
  branding: SiteBranding;
  storeAddress: StoreAddress | null;
  whatsappNumber: string;
}) {
  return (
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-lg text-center">
        {branding.logo ? (
          <Image src={branding.logo.url} alt={branding.logo.alt} width={branding.logo.width} height={branding.logo.height} className="mx-auto h-14 w-auto" priority />
        ) : (
          <p className="font-display text-2xl font-semibold text-ink">{storeAddress?.businessName ?? "Dishu Masala"}</p>
        )}
        <h1 className="mt-8 font-display text-3xl font-semibold text-ink">We&apos;ll be back shortly</h1>
        <p className="mt-3 text-ink-2">The shop is closed for a little while for some updates. Please check back soon.</p>
        {(storeAddress || whatsappNumber) && (
          <p className="mt-6 text-sm text-ink-2">
            Need us now?{" "}
            {whatsappNumber && (
              <a href={`https://wa.me/${whatsappNumber}`} className="font-medium text-brew-1 underline underline-offset-4">
                WhatsApp us
              </a>
            )}
            {whatsappNumber && storeAddress?.email ? " · " : ""}
            {storeAddress?.email && (
              <a href={`mailto:${storeAddress.email.toLowerCase()}`} className="font-medium text-brew-1 underline underline-offset-4">
                {storeAddress.email.toLowerCase()}
              </a>
            )}
          </p>
        )}
      </div>
    </main>
  );
}
