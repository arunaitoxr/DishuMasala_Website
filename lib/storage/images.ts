// No "server-only" guard here: this is a pure sharp image-processing pipeline that touches no
// secrets or database, so — unlike lib/storage/storage.ts — there's nothing environment-sensitive to
// gate. It's imported both from the Next.js app and directly from scripts/migrate-images.ts.
import sharp from "sharp";

/** Widths we generate derivatives at. Never upscaled past the source image's real width. */
export const DERIVATIVE_WIDTHS = [400, 800, 1200] as const;
export type DerivativeFormat = "avif" | "webp";

export interface ImageDerivative {
  width: number;
  height: number;
  format: DerivativeFormat;
  buffer: Buffer;
}

export interface ProcessedImage {
  originalWidth: number;
  originalHeight: number;
  derivatives: ImageDerivative[];
}

/**
 * Sharp pipeline producing AVIF + WebP derivatives at DERIVATIVE_WIDTHS, or the `widths` a caller
 * passes (CLAUDE.md §2 / §8).
 * Never upscales — a source narrower than a target width is only ever rendered at its own width,
 * and duplicate target widths (small source images) collapse to one derivative per format.
 */
export async function processImage(
  input: Buffer,
  /** Override for artwork shown wider than a product photo ever is — e.g. the full-bleed homepage
   * banner, which a 1200px derivative would render soft on any screen wider than 1200px. */
  widths: readonly number[] = DERIVATIVE_WIDTHS,
): Promise<ProcessedImage> {
  const metadata = await sharp(input, { failOn: "none" }).metadata();
  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  if (!originalWidth || !originalHeight) {
    throw new Error("processImage: could not read source image dimensions");
  }

  const targetWidths = [...new Set(widths.map((w) => Math.min(w, originalWidth)))];
  const derivatives: ImageDerivative[] = [];

  for (const targetWidth of targetWidths) {
    for (const format of ["avif", "webp"] as const) {
      const pipeline = sharp(input, { failOn: "none" }).resize({
        width: targetWidth,
        withoutEnlargement: true,
      });
      const buffer =
        format === "avif"
          ? await pipeline.avif({ quality: 60 }).toBuffer()
          : await pipeline.webp({ quality: 75 }).toBuffer();

      // A zero-length buffer means the encoder failed without throwing. Never upload that —
      // a silently-corrupt derivative is far worse than a failed upload.
      if (!buffer?.byteLength) {
        throw new Error(`processImage: the ${format} encoder produced an empty buffer at width ${targetWidth}`);
      }

      // Derive the dimensions arithmetically rather than by decoding our own output. `resize`
      // preserves aspect ratio and never enlarges, so this is exact for the width and correct to
      // the rounding for the height.
      //
      // We deliberately do NOT depend on being able to read the derivative back. `sharp(buffer)
      // .metadata()` on a freshly-written AVIF throws "Input buffer contains unsupported image
      // format" inside the Next.js server runtime — AVIF *encode* works there and produces a
      // valid file (verified: correct `ftyp` header, sensible byte length), but AVIF *decode* is
      // not available in that context, even though a plain Node process reports
      // `sharp.format.heif.input.buffer === true`. That asymmetry silently broke every admin
      // image upload while the scripts in scripts/ kept working, because those run under tsx.
      // Re-decoding an image we just encoded was never necessary; not doing it is both faster and
      // removes the dependency entirely.
      const width = Math.min(targetWidth, originalWidth);
      const height = Math.round((originalHeight / originalWidth) * width);

      derivatives.push({ width, height, format, buffer });
    }
  }

  return { originalWidth, originalHeight, derivatives };
}
