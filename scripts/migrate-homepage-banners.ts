/**
 * Uploads the client-supplied homepage main banners (data/mainBanner/*.png — provided directly by
 * the client, not scraped from the old site) to Supabase Storage and saves
 * `settings.homepage_banners`, an ordered list the homepage slider reads.
 *
 * IMPORTANT — deliberate, explicit exception to CLAUDE.md §8 ("invent nothing" / no health
 * claims): these banners carry the client's own marketing text baked directly into the image
 * pixels, including phrasing like "Belly Fat Reduction & Slimming" that would never be allowed in
 * text content this project writes itself. Claude flagged this conflict directly to the client
 * stakeholder before building it; the client explicitly chose to use the banners as-is anyway
 * (2026-08-28 — see the matching note in CLAUDE.md §8). Do not "fix" this by stripping the
 * claims or reverting to a placeholder without checking with the client again.
 *
 * Run with: pnpm migrate-homepage-banners
 */
import { closeScriptDb } from "../lib/db/script-client";
import { migrateBannerSet, type BannerSource } from "./_lib/banner-migrate";

/** The client's main-banner set (2026-09-20), in data/mainBanner/: `MB<n>_W.png` wide for desktop,
 * `MB<n>_M.png` 4:5 for phones, shown in file-number order. */
const BANNERS: BannerSource[] = [
  {
    slot: "main-spices",
    file: "MB1_W.png",
    mobileFile: "MB1_M.png",
    alt: "Every Spice Tells a Story of Good Food — Dishu Turmeric, Red Chilli, Coriander, Garam Masala and Black Pepper powders",
    href: "/collections/spices/",
  },
  {
    slot: "main-blue-tea",
    file: "MB2_W.png",
    mobileFile: "MB2_M.png",
    alt: "Nature's Blue. A Healthier You. — Dishu Premium Herbal Blue Tea with a cup of blue butterfly pea tea",
    href: "/collections/blue-tea/",
  },
  {
    slot: "main-red-tea",
    file: "MB3_W.png",
    mobileFile: "MB3_M.png",
    alt: "A Cup of Goodness, Everyday — Dishu Premium Herbal Red Tea with a cup of hibiscus tea",
    href: "/collections/red-tea/",
  },
];

migrateBannerSet("homepage_banners", BANNERS, "data/mainBanner")
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeScriptDb();
  });
