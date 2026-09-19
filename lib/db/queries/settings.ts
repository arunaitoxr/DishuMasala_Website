import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../index";
import { settings } from "../schema";
import { paise, type Paise } from "@/lib/money";
import { publicUrl } from "@/lib/storage/storage";

/** Shape of the `store_address` settings row — matches scripts/seed.ts exactly. Unknown facts the
 * client hasn't supplied yet (line1, pincode, email) are seeded as the literal string "TODO" and
 * must be rendered as-is, never invented (CLAUDE.md §8). */
export interface StoreAddress {
  businessName: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  email: string;
}

const FALLBACK_FREE_SHIPPING_THRESHOLD_PAISE = paise(50_000); // ₹500 — only used if the settings row is somehow missing.

/** Free-shipping threshold in paise, read from `settings` (CLAUDE.md §7.4) — never a hardcoded ₹500 literal at the call site. */
export async function getFreeShippingThresholdPaise(): Promise<Paise> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "free_shipping_threshold_paise"))
    .limit(1);

  if (row == null || typeof row.value !== "number") {
    return FALLBACK_FREE_SHIPPING_THRESHOLD_PAISE;
  }
  return paise(row.value);
}

/** Free-gift order threshold in paise, shown on the homepage trust strip ("🎁 Free gift on orders
 * above ₹X") — read from `settings`, never a hardcoded literal at the call site. `null` (the
 * trust strip omits the line entirely) until this is actually set: unlike free shipping, there is
 * no checkout/fulfillment logic anywhere in this codebase that adds a gift to a qualifying order —
 * displaying the claim without a real threshold configured would promise something no part of the
 * system, automated or otherwise, is wired to deliver. */
export async function getFreeGiftThresholdPaise(): Promise<Paise | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "free_gift_threshold_paise"))
    .limit(1);

  if (row == null || typeof row.value !== "number") return null;
  return paise(row.value);
}

// PLACEHOLDER — 10% is not a confirmed client decision, same draft status as content/home.ts's
// founderStory copy. Revisit once the client picks a real rate.
const FALLBACK_CROSS_PILLAR_BUNDLE_DISCOUNT_PERCENT = 10;

/** Whole-number percent for the automatic cross-pillar bundle discount (CLAUDE.md §7.2's
 * 2026-09-10 amendment) — read from `settings`, never a hardcoded literal in lib/commerce/pricing.ts. */
export async function getCrossPillarBundleDiscountPercent(): Promise<number> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "cross_pillar_bundle_discount_percent"))
    .limit(1);

  if (row == null || typeof row.value !== "number") {
    return FALLBACK_CROSS_PILLAR_BUNDLE_DISCOUNT_PERCENT;
  }
  return row.value;
}

/** Store contact/address details for the footer, exactly as scripts/seed.ts seeded them —
 * including the literal "TODO" placeholders where the client hasn't supplied real data yet. */
export async function getStoreAddress(): Promise<StoreAddress | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "store_address"))
    .limit(1);

  if (row == null) return null;
  return row.value as StoreAddress;
}

const FALLBACK_STANDARD_SHIPPING_PAISE = paise(5_000); // ₹50 — only used if the settings row is somehow missing.

/** Flat shipping fee in paise charged below the free-shipping threshold, read from `settings`
 * (never a hardcoded literal at a pricing call site — CLAUDE.md §7.4/§7.5). */
export async function getStandardShippingPaise(): Promise<Paise> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "standard_shipping_paise"))
    .limit(1);

  if (row == null || typeof row.value !== "number") {
    return FALLBACK_STANDARD_SHIPPING_PAISE;
  }
  return paise(row.value);
}

/** GSTIN for the footer's tax note. Seeded as the literal "TODO" until the client supplies a real
 * one — returned as null in that case, so the storefront never prints "GSTIN TODO" to shoppers (it
 * did, in the footer of every page). The admin settings snapshot keeps showing "TODO" so staff can
 * still see the value is missing. */
export async function getGstin(): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "gstin"))
    .limit(1);

  const value = typeof row?.value === "string" ? row.value.trim() : "";
  return value && value.toUpperCase() !== "TODO" ? value : null;
}

/** Announcement-bar copy (Phase 7's admin settings). Falls back to a plain, honest default that
 * states only real, always-true facts (the WELCOME5 coupon CLAUDE.md §7.4 guarantees exists) —
 * never an invented claim — if the settings row is somehow missing. */
export async function getAnnouncementBarText(): Promise<string> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "announcement_bar_text")).limit(1);
  if (row == null || typeof row.value !== "string") return "Free shipping over ₹500 · Use code WELCOME5 for 5% off your first order";
  return row.value;
}

/** The floating WhatsApp "click to chat" button's target number (components/marketing/
 * WhatsAppButton.tsx), digits only with country code (e.g. "917710219958") — `wa.me/<number>`
 * needs no "+" or spaces. Deliberately its own setting, not reused from `store_address.phone`:
 * that's the general seller-contact line quoted on policy pages, and the client's real WhatsApp
 * number is a different one. Empty string (not a fabricated placeholder) when unset, so the
 * button can just not render rather than link to a fake number.
 *
 * Stored as `{ number: "..." }`, never a bare string, to sidestep a real drizzle-orm +
 * node-postgres interaction: `pg` auto-parses `jsonb` columns into JS values at the driver level,
 * and drizzle-orm's own PgJsonb#mapFromDriverValue then unconditionally re-parses any value that
 * arrives as a string — so a bare jsonb string that itself happens to look like JSON (a
 * purely-numeric phone number, "true", "null") gets silently double-decoded into a number/
 * boolean/null. Every other bare-string setting here (`gstin`, `announcement_bar_text`) survives
 * only because its content isn't valid JSON on its own; an object value never hits that code path
 * at all, since `typeof value === "object"` skips the re-parse. */
export async function getWhatsAppNumber(): Promise<string> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "whatsapp_number")).limit(1);
  const value = row?.value as { number?: string } | undefined;
  return value?.number ?? "";
}

/** The support/sales inbox address — used by the corporate-gifting page's fallback contact row
 * (components/gifting/BulkEnquiryForm.tsx) and available anywhere else a real "email us" link is
 * needed. Empty string (never a fabricated address, CLAUDE.md §8) until
 * scripts/set-support-email.ts has been run. */
export async function getSupportEmail(): Promise<string> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "support_email")).limit(1);
  const value = row?.value as { email?: string } | undefined;
  return value?.email ?? "";
}

/** The maintenance/degraded-banner toggle (Phase 7's admin settings, consumed by a future
 * resilience phase's degraded banner per CLAUDE.md §9/PROMPTS.md Phase 9 item 5). Defaults to
 * false (not degraded) if the row is somehow missing. */
export async function getMaintenanceMode(): Promise<boolean> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "maintenance_mode")).limit(1);
  if (row == null || typeof row.value !== "boolean") return false;
  return row.value;
}

export interface SiteBrandingAsset {
  storageKey: string;
  width: number;
  height: number;
  alt: string;
}

export interface SiteBranding {
  logo: (SiteBrandingAsset & { url: string }) | null;
  favicon: (SiteBrandingAsset & { url: string }) | null;
}

/** The real logo + favicon migrated off dishumasala.com (scripts/migrate-brand-assets.ts) —
 * `null` for either slot until that script has been run, so callers must render the existing
 * text wordmark as a fallback rather than assume a real asset always exists (same "degrade
 * honestly, never fake it" discipline as every third-party asset in this project). */
export async function getSiteBranding(): Promise<SiteBranding> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "site_branding")).limit(1);
  const value = row?.value as { logo?: SiteBrandingAsset; favicon?: SiteBrandingAsset } | undefined;

  return {
    logo: value?.logo ? { ...value.logo, url: publicUrl(value.logo.storageKey) } : null,
    favicon: value?.favicon ? { ...value.favicon, url: publicUrl(value.favicon.storageKey) } : null,
  };
}

export interface HomepageBannerMobileRow {
  storageKey: string;
  width: number;
  height: number;
}

export interface HomepageBannerRow {
  slot: string;
  storageKey: string;
  width: number;
  height: number;
  alt: string;
  href: string;
  /** An optional separate crop/image for narrow viewports (e.g. a portrait 4:5 photo instead of
   * the desktop's wide landscape one) — client-supplied per banner, not derived. Falls back to
   * the main image at every breakpoint when absent. */
  mobile?: HomepageBannerMobileRow;
}

export type HomepageBanner = Omit<HomepageBannerRow, "mobile"> & {
  url: string;
  mobile?: HomepageBannerMobileRow & { url: string };
};

/** Shared reader for any banner-set settings row (scripts/_lib/banner-migrate.ts writes this same
 * shape) — an explicit, logged exception to CLAUDE.md §8's "invent nothing"/no-health-claims rule,
 * since these images carry the client's own marketing text baked into the pixels (see the
 * matching migrate script's header comment and CLAUDE.md §8's 2026-08-28 note). Empty array if the
 * script hasn't been run yet — callers must render nothing rather than a broken slider/section. */
async function getBannerSet(settingsKey: string): Promise<HomepageBanner[]> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, settingsKey)).limit(1);
  const value = row?.value as HomepageBannerRow[] | undefined;
  if (!Array.isArray(value)) return [];
  return value.map((banner) => ({
    ...banner,
    url: publicUrl(banner.storageKey),
    mobile: banner.mobile ? { ...banner.mobile, url: publicUrl(banner.mobile.storageKey) } : undefined,
  }));
}

/** The homepage promotional slider (scripts/migrate-homepage-banners.ts). */
export async function getHomepageBanners(): Promise<HomepageBanner[]> {
  return getBannerSet("homepage_banners");
}

/** The banner shown right after the homepage's Red Tea section (scripts/migrate-red-tea-banner.ts). */
export async function getRedTeaSectionBanner(): Promise<HomepageBanner[]> {
  return getBannerSet("red_tea_section_banner");
}

/** The banner shown at the top of the homepage's Spices section (scripts/migrate-spices-banner.ts). */
export async function getSpicesSectionBanner(): Promise<HomepageBanner[]> {
  return getBannerSet("spices_section_banner");
}

/** The banner shown right after the homepage's Red Tea section, introducing Classic & Assam
 * (scripts/migrate-classic-tea-banner.ts). */
export async function getClassicTeaSectionBanner(): Promise<HomepageBanner[]> {
  return getBannerSet("classic_tea_section_banner");
}

/** A collection page's own top-of-page hero banner (e.g. /collections/combos —
 * scripts/migrate-combos-page-banner.ts saves `settings["combos_page_banner"]`). Generic by
 * collection slug rather than one named function per collection, since only Combos has one today
 * but any collection could get one later the same way. Empty array (not an error) for a
 * collection with no banner migrated yet. */
export async function getCollectionPageBanner(collectionSlug: string): Promise<HomepageBanner[]> {
  return getBannerSet(`${collectionSlug.replace(/-/g, "_")}_page_banner`);
}

export interface SectionImage {
  storageKey: string;
  width: number;
  height: number;
  alt: string;
  url: string;
}

/** The Red Tea section's real lifestyle photo (scripts/migrate-red-tea-lifestyle.ts), replacing
 * its AI-placeholder slot. `null` until that script has been run — callers must fall back to the
 * placeholder rather than assume a real photo always exists. */
export async function getRedTeaLifestyleImage(): Promise<SectionImage | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "red_tea_lifestyle_image")).limit(1);
  const value = row?.value as Omit<SectionImage, "url"> | undefined;
  if (!value) return null;
  return { ...value, url: publicUrl(value.storageKey) };
}

/** The corporate/bulk-gifting page's hero flat-lay (app/corporate-gifting/page.tsx) — the client's
 * real hamper photo, once uploaded through the same migration pipeline every other real section
 * photo uses. `null` (falls back to the "corporate-gifting-hero" placeholder) until that upload
 * happens. */
export async function getCorporateGiftingHeroImage(): Promise<SectionImage | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "corporate_gifting_hero_image")).limit(1);
  const value = row?.value as Omit<SectionImage, "url"> | undefined;
  if (!value) return null;
  return { ...value, url: publicUrl(value.storageKey) };
}

/** The corporate/bulk-gifting page's mobile-specific hero photo (GiftingHero.tsx's `lg:hidden`
 * block) — a separate, portrait-cropped shot from the desktop hero, not the same image resized,
 * since the client supplied a genuinely different framing for the narrow layout. `null` until
 * uploaded; GiftingHero.tsx falls back to the desktop hero image (then the placeholder) rather
 * than rendering nothing. */
export async function getCorporateGiftingHeroMobileImage(): Promise<SectionImage | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "corporate_gifting_hero_mobile_image"))
    .limit(1);
  const value = row?.value as Omit<SectionImage, "url"> | undefined;
  if (!value) return null;
  return { ...value, url: publicUrl(value.storageKey) };
}

/** Real photos for the corporate-gifting page's gift-pack cards (GiftPackCarousel.tsx), keyed by
 * the pack's own slug (content/gifting.ts's `GIFT_PACKS[].slug`) — the client's actual hamper/box
 * photography for each curated bundle, not a single real product's packshot standing in for the
 * whole pack. Empty object (never an error) until scripts/migrate-gifting-images.ts has run;
 * callers fall back to the per-product image resolution (app/corporate-gifting/page.tsx) or the
 * generic placeholder for any pack slug missing here. */
export async function getGiftPackImages(): Promise<Record<string, SectionImage>> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gift_pack_images")).limit(1);
  const value = row?.value as Record<string, Omit<SectionImage, "url">> | undefined;
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).map(([slug, img]) => [slug, { ...img, url: publicUrl(img.storageKey) }]));
}

/** Per-collection homepage CategoryCircles photo (scripts/migrate-category-circles.ts), keyed by
 * collection slug. Deliberately separate from a product's own gallery images — those are picked
 * for the PDP, not for a small round icon, and are often marketing infographics that look bad
 * cropped into a circle. Empty object (never an error) until the script has been run; callers must
 * fall back to a placeholder or omit the circle's photo for any slug missing here. */
export async function getCategoryCircleImages(): Promise<Record<string, SectionImage>> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "category_circle_images")).limit(1);
  const value = row?.value as Record<string, Omit<SectionImage, "url">> | undefined;
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).map(([slug, img]) => [slug, { ...img, url: publicUrl(img.storageKey) }]),
  );
}

/** Every settings row the admin settings page (Phase 7 item 6) reads and edits, in one round
 * trip — the "one typed helper" every settings read in this codebase goes through (grepped and
 * confirmed at the end of Phase 7: no component reads `settings` ad hoc or hardcodes a literal
 * that belongs here instead). */
export interface AdminSettingsSnapshot {
  freeShippingThresholdPaise: Paise;
  standardShippingPaise: Paise;
  storeAddress: StoreAddress;
  gstin: string;
  announcementBarText: string;
  maintenanceMode: boolean;
  whatsappNumber: string;
}

const EMPTY_STORE_ADDRESS: StoreAddress = {
  businessName: "Dishu Food and Beverages",
  line1: "TODO",
  city: "TODO",
  state: "TODO",
  pincode: "TODO",
  country: "India",
  phone: "TODO",
  email: "TODO",
};

export async function getAdminSettingsSnapshot(): Promise<AdminSettingsSnapshot> {
  const [freeShippingThresholdPaise, standardShippingPaise, storeAddress, gstin, announcementBarText, maintenanceMode, whatsappNumber] =
    await Promise.all([
      getFreeShippingThresholdPaise(),
      getStandardShippingPaise(),
      getStoreAddress(),
      getGstin(),
      getAnnouncementBarText(),
      getMaintenanceMode(),
      getWhatsAppNumber(),
    ]);
  return {
    freeShippingThresholdPaise,
    standardShippingPaise,
    storeAddress: storeAddress ?? EMPTY_STORE_ADDRESS,
    gstin: gstin ?? "TODO",
    announcementBarText,
    maintenanceMode,
    whatsappNumber,
  };
}
