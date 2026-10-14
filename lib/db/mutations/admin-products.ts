import "server-only";

/**
 * Admin catalogue writes (PROMPTS.md Phase 8 item 1). Called only from
 * app/admin/products/actions.ts, which does Zod validation, the `requireStaffOrAdmin()` re-check,
 * `writeAuditLog`, and `revalidateTag`/`revalidatePath` — this file is the DB-transaction layer,
 * same split as lib/db/mutations/admin-orders.ts.
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../index";
import { orderItems, productImages, products, variants } from "../schema";
import { createHash, randomUUID } from "node:crypto";
import { buildKey, deleteObject, getObject, listImageFamily, putObject, presignUpload } from "@/lib/storage/storage";
import { processImage } from "@/lib/storage/images";
import { isSlugTaken } from "../queries/admin-products";

export interface VariantInput {
  id?: number;
  sku: string;
  optionValue: string;
  mrpPaise: number;
  pricePaise: number;
  weightGrams: number | null;
  inStock: boolean;
  stockQty: number | null;
  position: number;
}

export interface ProductInput {
  slug: string;
  name: string;
  collectionId: number;
  shortDescription: string | null;
  description: string | null;
  ingredients: string | null;
  brewGuide: string | null;
  tags: string[];
  optionLabel: string;
  priority: number;
  seoTitle: string | null;
  seoDescription: string | null;
  variants: VariantInput[];
}

/** Creates a product with its variants in one transaction. Status always starts as "draft" —
 * publishing is a separate, validated action (see publishProductDb below). */
export async function createProductDb(input: ProductInput): Promise<number> {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        slug: input.slug,
        name: input.name,
        collectionId: input.collectionId,
        shortDescription: input.shortDescription,
        description: input.description,
        ingredients: input.ingredients,
        brewGuide: input.brewGuide,
        tags: input.tags,
        optionLabel: input.optionLabel,
        priority: input.priority,
        status: "draft",
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      })
      .returning({ id: products.id });

    if (input.variants.length > 0) {
      await tx.insert(variants).values(
        input.variants.map((v, i) => ({
          productId: product.id,
          sku: v.sku,
          optionValue: v.optionValue,
          mrpPaise: v.mrpPaise,
          pricePaise: v.pricePaise,
          weightGrams: v.weightGrams,
          inStock: v.inStock,
          stockQty: v.stockQty,
          position: v.position ?? i,
        })),
      );
    }
    return product.id;
  });
}

/** Updates a product's fields and replaces its variant set (add/update/delete/reorder) in one
 * transaction. Images are managed by separate, dedicated actions (finalize/delete/reorder/setPrimary
 * below) since they involve storage side effects that don't belong inside this DB transaction. */
export async function updateProductDb(id: number, input: ProductInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        slug: input.slug,
        name: input.name,
        collectionId: input.collectionId,
        shortDescription: input.shortDescription,
        description: input.description,
        ingredients: input.ingredients,
        brewGuide: input.brewGuide,
        tags: input.tags,
        optionLabel: input.optionLabel,
        priority: input.priority,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));

    const existing = await tx.select({ id: variants.id }).from(variants).where(eq(variants.productId, id));
    const existingIds = new Set(existing.map((v) => v.id));
    const keptIds = new Set(input.variants.filter((v) => v.id != null).map((v) => v.id!));
    const toDelete = [...existingIds].filter((vid) => !keptIds.has(vid));
    if (toDelete.length > 0) {
      await tx.delete(variants).where(inArray(variants.id, toDelete));
    }

    // Park every kept variant on a unique placeholder SKU first, so the final writes below can swap
    // SKUs between variants (or reuse a deleted variant's SKU) without tripping `variants_sku_uniq`
    // partway through — a failed unique check used to take down the whole editor.
    for (const v of input.variants) {
      if (v.id != null && existingIds.has(v.id)) {
        await tx.update(variants).set({ sku: `__saving__${v.id}` }).where(eq(variants.id, v.id));
      }
    }

    for (const [i, v] of input.variants.entries()) {
      const values = {
        sku: v.sku,
        optionValue: v.optionValue,
        mrpPaise: v.mrpPaise,
        pricePaise: v.pricePaise,
        weightGrams: v.weightGrams,
        inStock: v.inStock,
        stockQty: v.stockQty,
        position: v.position ?? i,
      };
      if (v.id != null && existingIds.has(v.id)) {
        await tx.update(variants).set(values).where(eq(variants.id, v.id));
      } else {
        await tx.insert(variants).values({ productId: id, ...values });
      }
    }
  });
}

export type PublishResult = { ok: true } | { ok: false; error: string };

/**
 * Real publish gate (PROMPTS.md Phase 8's explicitly-checked acceptance criterion): a product with
 * ANY image missing real alt text is rejected here, server-side — not merely disabled in the UI.
 * Also requires at least one image and one variant, since a "published" product with neither is
 * not a real, sellable listing.
 */
export async function publishProductDb(id: number): Promise<PublishResult> {
  const [current] = await db.select({ status: products.status }).from(products).where(eq(products.id, id)).limit(1);
  if (!current) return { ok: false, error: "Product not found." };
  if (current.status === "archived") return { ok: false, error: "This product is deleted — restore it first." };
  const images = await db.select({ alt: productImages.alt }).from(productImages).where(eq(productImages.productId, id));
  const variantRows = await db.select({ id: variants.id }).from(variants).where(eq(variants.productId, id));

  if (variantRows.length === 0) return { ok: false, error: "Add at least one variant before publishing." };
  if (images.length === 0) return { ok: false, error: "Add at least one image before publishing." };
  const missingAlt = images.some((img) => !img.alt || img.alt.trim().length === 0);
  if (missingAlt) {
    return { ok: false, error: "Every image needs real alt text before this product can be published." };
  }

  await db.update(products).set({ status: "published", updatedAt: new Date() }).where(eq(products.id, id));
  return { ok: true };
}

/** Published → draft. An archived (deleted) product stays archived; restoring is a separate step. */
export async function unpublishProductDb(id: number): Promise<void> {
  await db.update(products).set({ status: "draft", updatedAt: new Date() }).where(and(eq(products.id, id), eq(products.status, "published")));
}

// -----------------------------------------------------------------------------------------------
// Images
// -----------------------------------------------------------------------------------------------

export interface PresignedUploadResult {
  url: string;
  tmpKey: string;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Step 1 of the upload flow: a presigned PUT to a temp key. The browser uploads the original
 * bytes straight to Supabase Storage with this URL — they never pass through our server on the way in. */
export async function presignProductImageUploadDb(
  productSlug: string,
  contentType: string,
  contentLength: number,
): Promise<PresignedUploadResult> {
  const ext = ALLOWED_MIME[contentType];
  if (!ext) throw new Error(`Unsupported content type "${contentType}" — only JPEG, PNG or WEBP are allowed.`);
  if (contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES) throw new Error("File must be non-empty and at most 5MB.");

  const tmpKey = buildKey("products", productSlug, `tmp-${randomUUID()}`, ext);
  const { url } = await presignUpload({ key: tmpKey, contentType, contentLength });
  return { url, tmpKey };
}

/** A temp key this product's own presign step could have produced — never an arbitrary object in
 * the bucket (finalize fetches the key and then deletes it, so trusting a client-supplied key would
 * let a staff session delete any live file). */
function assertOwnTmpKey(productSlug: string, tmpKey: string): void {
  const prefix = `products/${productSlug}/tmp-`;
  if (!tmpKey.startsWith(prefix) || tmpKey.includes("..") || !/^[a-z0-9/._-]+$/i.test(tmpKey)) {
    throw new Error("That upload doesn't belong to this product — please upload the file again.");
  }
}

/** Runs the sharp AVIF/WebP pipeline on an uploaded original and stores every derivative; returns
 * the canonical (largest WebP) key the database records. Deletes the temp original. */
async function processUpload(productSlug: string, tmpKey: string): Promise<{ storageKey: string; width: number; height: number }> {
  assertOwnTmpKey(productSlug, tmpKey);
  const originalBuffer = await getObject(tmpKey);
  const processed = await processImage(originalBuffer);

  const hash = createHash("sha256").update(originalBuffer).digest("hex").slice(0, 16);
  let storageKey = "";
  let width = 0;
  let height = 0;
  for (const derivative of processed.derivatives) {
    const key = buildKey("products", productSlug, hash, derivative.format, `w${derivative.width}`);
    await putObject(key, derivative.buffer, `image/${derivative.format}`);
    if (derivative.format === "webp" && derivative.width >= width) {
      storageKey = key;
      width = derivative.width;
      height = derivative.height;
    }
  }

  await deleteObject(tmpKey).catch(() => {
    // Best-effort cleanup of the temp original — never referenced by any row, just storage waste.
  });
  return { storageKey, width, height };
}

/**
 * Deletes an image's files (every derivative) once nothing still needs them: no other image row
 * points at the same key, and no past order shows it. `order_items.image_storage_key` snapshots the
 * product's primary image at checkout, so removing those files would break old orders' thumbnails.
 */
async function deleteImageFilesIfUnused(storageKey: string): Promise<void> {
  const [imageRefs] = await db.select({ n: sql<number>`count(*)` }).from(productImages).where(eq(productImages.storageKey, storageKey));
  const [orderRefs] = await db.select({ n: sql<number>`count(*)` }).from(orderItems).where(eq(orderItems.imageStorageKey, storageKey));
  if (Number(imageRefs?.n ?? 0) > 0 || Number(orderRefs?.n ?? 0) > 0) return;
  const family = await listImageFamily(storageKey).catch(() => [storageKey]);
  for (const key of family) {
    await deleteObject(key).catch(() => {
      // The row is already gone — a file that fails to delete is storage waste, not a broken page.
    });
  }
}

/** Step 2: after the browser's presigned PUT succeeds, the server fetches the original back, builds
 * the derivatives and inserts the `product_images` row (alt text starts empty and MUST be filled in
 * before publish — see publishProductDb). The slug comes from the saved product, not the form. */
export async function finalizeProductImageUploadDb(
  productId: number,
  tmpKey: string,
): Promise<{ id: number; storageKey: string; width: number; height: number; productSlug: string }> {
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error("Product not found.");
  const { storageKey, width, height } = await processUpload(product.slug, tmpKey);

  const existingImages = await db
    .select({ position: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position));
  const isFirstImage = existingImages.length === 0;
  const nextPosition = existingImages.length > 0 ? Math.max(...existingImages.map((p) => p.position)) + 1 : 0;

  const [row] = await db
    .insert(productImages)
    .values({ productId, storageKey, alt: "", width, height, position: nextPosition, isPrimary: isFirstImage })
    .returning({ id: productImages.id, storageKey: productImages.storageKey, width: productImages.width, height: productImages.height });

  return { ...row, productSlug: product.slug };
}

/** Swaps the file behind an existing image, keeping its alt text, position and primary flag; the old
 * files are removed if nothing else needs them. */
export async function replaceProductImageDb(
  productId: number,
  imageId: number,
  tmpKey: string,
): Promise<{ storageKey: string; productSlug: string }> {
  const [image] = await db
    .select({ id: productImages.id, storageKey: productImages.storageKey, slug: products.slug })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
    .limit(1);
  if (!image) throw new Error("Image not found on this product.");

  const { storageKey, width, height } = await processUpload(image.slug, tmpKey);
  await db.update(productImages).set({ storageKey, width, height }).where(eq(productImages.id, imageId));
  if (image.storageKey !== storageKey) await deleteImageFilesIfUnused(image.storageKey);
  return { storageKey, productSlug: image.slug };
}

/** Saves alt text; returns the owning product's slug so the caller can refresh its storefront page. */
export async function updateProductImageAltDb(imageId: number, alt: string): Promise<{ productSlug: string } | null> {
  const [row] = await db
    .update(productImages)
    .set({ alt })
    .where(eq(productImages.id, imageId))
    .returning({ productId: productImages.productId });
  if (!row) return null;
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, row.productId)).limit(1);
  return product ? { productSlug: product.slug } : null;
}

/** Re-orders a product's images. Every id must belong to that product (and all of them must be
 * listed), so a stale or tampered list can't move another product's images. */
export async function reorderProductImagesDb(productId: number, orderedIds: number[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const own = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
  const ownIds = new Set(own.map((r) => r.id));
  if (orderedIds.length !== ownIds.size || orderedIds.some((id) => !ownIds.has(id))) {
    return { ok: false, error: "The image list is out of date — reload the page and try again." };
  }
  await db.transaction(async (tx) => {
    for (const [i, imgId] of orderedIds.entries()) {
      await tx.update(productImages).set({ position: i }).where(and(eq(productImages.id, imgId), eq(productImages.productId, productId)));
    }
  });
  return { ok: true };
}

export async function setPrimaryProductImageDb(productId: number, imageId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [image] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
    .limit(1);
  if (!image) return { ok: false, error: "Image not found on this product." };
  await db.transaction(async (tx) => {
    await tx.update(productImages).set({ isPrimary: false }).where(and(eq(productImages.productId, productId), ne(productImages.id, imageId)));
    await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId));
  });
  return { ok: true };
}

export type DeleteImageResult = { ok: true; productSlug: string } | { ok: false; error: string };

/** Deletes an image row and, when nothing else needs them, all of its files. If it was the primary
 * image, the next one in order takes over. */
export async function deleteProductImageDb(productId: number, imageId: number): Promise<DeleteImageResult> {
  const [image] = await db
    .select({ id: productImages.id, storageKey: productImages.storageKey, isPrimary: productImages.isPrimary, slug: products.slug })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
    .limit(1);
  if (!image) return { ok: false, error: "Image not found on this product." };

  await db.delete(productImages).where(eq(productImages.id, imageId));
  await deleteImageFilesIfUnused(image.storageKey);

  if (image.isPrimary) {
    const [next] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position))
      .limit(1);
    if (next) await db.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, next.id));
  }
  return { ok: true, productSlug: image.slug };
}

// -----------------------------------------------------------------------------------------------
// Delete: archive (soft), restore, delete permanently
// -----------------------------------------------------------------------------------------------

/** Soft delete (CLAUDE.md §9): `archived` products vanish from the storefront — every storefront read
 * filters `status = 'published'` — but stay restorable. */
export async function archiveProductDb(id: number): Promise<void> {
  await db.update(products).set({ status: "archived", updatedAt: new Date() }).where(eq(products.id, id));
}

/** Brings an archived product back as a draft, to be checked and published again. */
export async function restoreProductDb(id: number): Promise<void> {
  await db.update(products).set({ status: "draft", updatedAt: new Date() }).where(eq(products.id, id));
}

/**
 * Removes an archived product for good: its variants, images, reviews and wishlist entries go with
 * it (foreign keys cascade). Past orders are untouched — `order_items` keeps its own snapshot of name,
 * SKU, price and image, and only loses the link to the variant (set null) — and image files that an
 * old order still shows are kept.
 */
export async function deleteProductPermanentlyDb(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [product] = await db.select({ status: products.status }).from(products).where(eq(products.id, id)).limit(1);
  if (!product) return { ok: false, error: "Product not found." };
  if (product.status !== "archived") return { ok: false, error: "Archive the product first, then delete it permanently." };

  // One transaction, and the delete itself re-checks "archived": a restore landing between the
  // check above and the delete must not get a live product wiped.
  const images = await db.transaction(async (tx) => {
    const keys = await tx.select({ storageKey: productImages.storageKey }).from(productImages).where(eq(productImages.productId, id));
    const deleted = await tx.delete(products).where(and(eq(products.id, id), eq(products.status, "archived"))).returning({ id: products.id });
    return deleted.length > 0 ? keys : null;
  });
  if (!images) return { ok: false, error: "Archive the product first, then delete it permanently." };
  for (const img of images) await deleteImageFilesIfUnused(img.storageKey);
  return { ok: true };
}

export { isSlugTaken };
