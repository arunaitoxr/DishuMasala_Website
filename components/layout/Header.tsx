import { getCollectionsWithStats } from "@/lib/db/queries/collections";
import { getAnnouncementBarText, getFreeShippingThresholdPaise, getSiteBranding } from "@/lib/db/queries/settings";
import { formatINR } from "@/lib/money";
import { buildMegaMenuColumns } from "@/lib/nav";
import { HeaderClient } from "./HeaderClient";

/** Server wrapper — reads collections (priority order), the free-shipping threshold, and the real
 * site branding straight from Postgres (CLAUDE.md §3.2: no query inline in a component) and hands
 * plain, serializable props down to the interactive client header. */
export async function Header() {
  const [collections, freeShippingThresholdPaise, branding, announcementText] = await Promise.all([
    getCollectionsWithStats(),
    getFreeShippingThresholdPaise(),
    getSiteBranding(),
    getAnnouncementBarText(),
  ]);
  // Admin → Settings → Announcement-bar text; empty means the standard free-shipping line, and
  // {free_shipping} always shows the live threshold rather than an amount typed once and forgotten.
  const threshold = formatINR(freeShippingThresholdPaise);
  const announcement = announcementText.trim() ? announcementText.replaceAll("{free_shipping}", threshold) : `Free shipping over ${threshold}`;

  const columns = buildMegaMenuColumns(collections);

  return (
    <HeaderClient
      columns={columns}
      announcement={announcement}
      logo={branding.logo}
    />
  );
}
