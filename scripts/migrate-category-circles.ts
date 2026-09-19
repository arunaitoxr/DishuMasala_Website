/**
 * Uploads the client-supplied per-collection photos in data/category/ for the homepage's
 * CategoryCircles strip and saves `settings.category_circle_images`, keyed by collection slug.
 *
 * The six photos are one consistent studio set (same light, same ground), which is what makes the
 * strip read as one row rather than six unrelated crops of marketing infographics.
 *
 * Run with: pnpm migrate-category-circles
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildKey, putObject } from "../lib/storage/storage-core";
import { processImage } from "../lib/storage/images";
import { closeScriptDb, scriptDb } from "../lib/db/script-client";
import { settings } from "../lib/db/schema";

/** Collection slug -> the client's file in data/category/ (named by the client, 2026-09-20). */
const FILES: Record<string, { file: string; alt: string }> = {
  "blue-tea": { file: "BlueTea.png", alt: "Dishu Premium Herbal Blue Tea pack with a cup of blue butterfly pea tea" },
  "red-tea": { file: "RedTea.png", alt: "Dishu Premium Herbal Red Tea pack with a cup of hibiscus tea" },
  "tea-combos": { file: "TeaCombo.png", alt: "Dishu Blue Tea and Red Tea packs side by side" },
  spices: { file: "Spices.png", alt: "Dishu Black Pepper Powder pack with whole and ground pepper" },
  combos: { file: "SpiceCombo.png", alt: "Dishu spice range — Black Pepper, Coriander, Garam Masala and Red Chilli packs" },
  "classic-teas": { file: "BlackTea.png", alt: "Dishu Black Tea packs with a glass of milk tea" },
};

async function main(): Promise<void> {
  // Reads from inside the repo (never ~/Downloads), so it runs the same on every machine and in CI.
  const dir = join(process.cwd(), "data/category");
  const value: Record<string, { storageKey: string; width: number; height: number; alt: string }> = {};

  for (const [slug, { file, alt }] of Object.entries(FILES)) {
    const source = join(dir, file);
    if (!existsSync(source)) {
      // A clear instruction beats a raw ENOENT stack. Until these land, app/page.tsx falls back to
      // each collection's lead product photo, so the circles render something real either way.
      throw new Error(`Missing ${source}. See data/category/README.md for the expected file names.`);
    }
    const buffer = readFileSync(source);
    const processed = await processImage(buffer);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);

    let canonicalKey: string | null = null;
    let canonicalWidth = 0;
    let canonicalHeight = 0;

    for (const derivative of processed.derivatives) {
      const key = buildKey("sections", `category-circle-${slug}`, hash, derivative.format, `w${derivative.width}`);
      await putObject(key, derivative.buffer, `image/${derivative.format}`);
      if (derivative.format === "webp" && derivative.width >= canonicalWidth) {
        canonicalKey = key;
        canonicalWidth = derivative.width;
        canonicalHeight = derivative.height;
      }
    }

    if (!canonicalKey) throw new Error(`${slug}: no webp derivative produced`);
    value[slug] = { storageKey: canonicalKey, width: canonicalWidth, height: canonicalHeight, alt };
    console.log(`[uploaded] ${slug}: ${file} -> ${canonicalKey} (${canonicalWidth}x${canonicalHeight})`);
  }

  await scriptDb
    .insert(settings)
    .values({ key: "category_circle_images", value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });

  console.log("settings.category_circle_images upserted.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeScriptDb();
  });
