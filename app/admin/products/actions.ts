"use server";

/**
 * Product/variant/image admin mutations (PROMPTS.md Phase 8 item 1). Same discipline as
 * app/admin/orders/actions.ts: `requireStaffOrAdmin()` first, Zod-validated input, `audit_log` via
 * `lib/audit.ts`, `revalidateTag`/`revalidatePath` for every storefront cache the change could
 * affect, typed results only.
 *
 * Rupee→paise conversion (the acceptance criterion "Rupee input 549 stores exactly 54900 paise")
 * happens ONLY here, via `lib/money.ts`'s `toPaise` — never in the client form, which only ever
 * shows the resulting paise value as a live preview using the same rounding rule.
 */
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import {
  createProductDb,
  updateProductDb,
  publishProductDb,
  unpublishProductDb,
  presignProductImageUploadDb,
  finalizeProductImageUploadDb,
  replaceProductImageDb,
  updateProductImageAltDb,
  reorderProductImagesDb,
  setPrimaryProductImageDb,
  deleteProductImageDb,
  archiveProductDb,
  restoreProductDb,
  deleteProductPermanentlyDb,
  type ProductInput,
} from "@/lib/db/mutations/admin-products";
import { isSlugTaken, getProductSlugAndStatus, getAdminProductById, findSkusUsedElsewhere } from "@/lib/db/queries/admin-products";

export type AdminResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) {
    return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  }
  return { ok: true as const, user: session.user };
}

function revalidateCatalog(slug?: string) {
  updateTag("products");
  if (slug) updateTag(`product:${slug}`);
  // The homepage review carousel only shows reviews of published products, and links to them.
  updateTag("reviews");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  if (slug) revalidatePath(`/product/${slug}`);
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  optionValue: z.string().trim().min(1, "Option value is required").max(120),
  mrpRupees: z.coerce.number().positive("MRP must be greater than 0"),
  priceRupees: z.coerce.number().positive("Price must be greater than 0"),
  weightGrams: z.coerce.number().int().positive().nullable(),
  inStock: z.boolean(),
  stockQty: z.coerce.number().int().min(0).nullable(),
  position: z.number().int().min(0),
});

const productSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(slugPattern, "Lowercase letters, numbers and hyphens only"),
  name: z.string().trim().min(1, "Name is required").max(200),
  collectionId: z.coerce.number().int().positive(),
  shortDescription: z.string().trim().max(500).nullable(),
  description: z.string().trim().max(5000).nullable(),
  ingredients: z.string().trim().max(2000).nullable(),
  brewGuide: z.string().trim().max(2000).nullable(),
  tags: z.array(z.string().trim().min(1)).max(20),
  optionLabel: z.string().trim().min(1, "Option label is required").max(40),
  priority: z.coerce.number().int().min(1).max(99),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(200).nullable(),
  variants: z
    .array(variantSchema)
    .min(1, "Add at least one variant")
    .refine((vs) => new Set(vs.map((v) => v.sku.toUpperCase())).size === vs.length, "Two variants have the same SKU — every SKU must be different")
    .refine((vs) => vs.every((v) => v.priceRupees <= v.mrpRupees), "A variant's price can't be higher than its MRP"),
});

/** SKUs are unique across the whole store; say which one clashes instead of letting the database's
 * unique index throw mid-save. */
async function skuConflictError(variantsIn: { sku: string }[], productId?: number): Promise<string | null> {
  const taken = await findSkusUsedElsewhere(variantsIn.map((v) => v.sku), productId);
  return taken.length > 0 ? `SKU ${taken.join(", ")} is already used by another product.` : null;
}

/** Postgres unique-violation (23505) — the last line of defence if two saves race. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function toDbInput(parsed: z.infer<typeof productSchema>): ProductInput {
  return {
    slug: parsed.slug,
    name: parsed.name,
    collectionId: parsed.collectionId,
    shortDescription: parsed.shortDescription || null,
    description: parsed.description || null,
    ingredients: parsed.ingredients || null,
    brewGuide: parsed.brewGuide || null,
    tags: parsed.tags,
    optionLabel: parsed.optionLabel,
    priority: parsed.priority,
    seoTitle: parsed.seoTitle || null,
    seoDescription: parsed.seoDescription || null,
    variants: parsed.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      optionValue: v.optionValue,
      mrpPaise: toPaise(v.mrpRupees),
      pricePaise: toPaise(v.priceRupees),
      weightGrams: v.weightGrams,
      inStock: v.inStock,
      stockQty: v.stockQty,
      position: v.position,
    })),
  };
}

export async function checkSlugAvailableAction(slug: string, excludeId?: number): Promise<{ available: boolean }> {
  const auth = await requireStaff();
  if (!auth.ok) return { available: false };
  const taken = await isSlugTaken(slug, excludeId);
  return { available: !taken };
}

export async function createProductAction(input: z.infer<typeof productSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (await isSlugTaken(parsed.data.slug)) {
    return { ok: false, error: `The slug "${parsed.data.slug}" is already used by another product.` };
  }

  const skuError = await skuConflictError(parsed.data.variants);
  if (skuError) return { ok: false, error: skuError };

  const dbInput = toDbInput(parsed.data);
  let id: number;
  try {
    id = await createProductDb(dbInput);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "That slug or a SKU was just taken by another product — check them and save again." };
    throw e;
  }

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.create",
    entity: "product",
    entityId: id,
    diff: { name: dbInput.name, slug: dbInput.slug, variantCount: dbInput.variants.length },
  });
  revalidateCatalog(dbInput.slug);
  return { ok: true, message: "Product created as a draft.", data: { id } };
}

export async function updateProductAction(id: number, input: z.infer<typeof productSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await getProductSlugAndStatus(id);
  if (!existing) return { ok: false, error: "Product not found." };

  if (await isSlugTaken(parsed.data.slug, id)) {
    return { ok: false, error: `The slug "${parsed.data.slug}" is already used by another product.` };
  }

  const skuError = await skuConflictError(parsed.data.variants, id);
  if (skuError) return { ok: false, error: skuError };

  const dbInput = toDbInput(parsed.data);
  try {
    await updateProductDb(id, dbInput);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "That slug or a SKU was just taken by another product — check them and save again." };
    throw e;
  }

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.update",
    entity: "product",
    entityId: id,
    diff: {
      slug: existing.slug === dbInput.slug ? undefined : { from: existing.slug, to: dbInput.slug },
      name: dbInput.name,
      variantCount: dbInput.variants.length,
    },
  });
  revalidateCatalog(existing.slug);
  if (existing.slug !== dbInput.slug) revalidateCatalog(dbInput.slug);
  return { ok: true, message: "Product saved." };
}

export async function publishProductAction(id: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const product = await getAdminProductById(id);
  if (!product) return { ok: false, error: "Product not found." };

  const result = await publishProductDb(id);
  if (!result.ok) return { ok: false, error: result.error };

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.publish",
    entity: "product",
    entityId: id,
    diff: { slug: product.slug, status: { from: "draft", to: "published" } },
  });
  revalidateCatalog(product.slug);
  return { ok: true, message: "Product published — it's live on the storefront now." };
}

export async function unpublishProductAction(id: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const product = await getAdminProductById(id);
  if (!product) return { ok: false, error: "Product not found." };

  await unpublishProductDb(id);
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.unpublish",
    entity: "product",
    entityId: id,
    diff: { slug: product.slug, status: { from: "published", to: "draft" } },
  });
  revalidateCatalog(product.slug);
  return { ok: true, message: "Product moved back to draft." };
}

// -------------------------------------------------------------------------------------------
// Images
// -------------------------------------------------------------------------------------------

const presignSchema = z.object({
  productSlug: z.string().trim().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  contentLength: z.number().int().positive().max(5 * 1024 * 1024),
});

export async function presignProductImageUploadAction(
  input: z.infer<typeof presignSchema>,
): Promise<AdminResult<{ url: string; tmpKey: string }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = presignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const result = await presignProductImageUploadDb(parsed.data.productSlug, parsed.data.contentType, parsed.data.contentLength);
    return { ok: true, message: "Ready to upload.", data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare the upload." };
  }
}

const finalizeSchema = z.object({
  productId: z.number().int().positive(),
  tmpKey: z.string().trim().min(1),
});

export async function finalizeProductImageUploadAction(
  input: z.infer<typeof finalizeSchema>,
): Promise<AdminResult<{ id: number; url: string }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const row = await finalizeProductImageUploadDb(parsed.data.productId, parsed.data.tmpKey);
    const { publicUrl } = await import("@/lib/storage/storage");
    await writeAuditLog({
      actorUserId: auth.user.id,
      action: "product.image_upload",
      entity: "product",
      entityId: parsed.data.productId,
      diff: { storageKey: row.storageKey, width: row.width, height: row.height },
    });
    revalidatePath(`/admin/products/${parsed.data.productId}`);
    revalidateCatalog(row.productSlug); // a published product shows the new image straight away
    return { ok: true, message: "Image uploaded — add alt text before publishing.", data: { id: row.id, url: publicUrl(row.storageKey) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload processing failed." };
  }
}

const altSchema = z.object({ imageId: z.number().int().positive(), alt: z.string().trim().max(200) });

export async function updateProductImageAltAction(input: z.infer<typeof altSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = altSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const saved = await updateProductImageAltDb(parsed.data.imageId, parsed.data.alt);
  if (!saved) return { ok: false, error: "Image not found." };
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.image_alt_update",
    entity: "product_image",
    entityId: parsed.data.imageId,
    diff: { alt: parsed.data.alt },
  });
  revalidateCatalog(saved.productSlug); // the storefront's cached product page carries the alt text
  return { ok: true, message: "Alt text saved." };
}

const reorderSchema = z.object({ productId: z.number().int().positive(), orderedIds: z.array(z.number().int().positive()).min(1) });

export async function reorderProductImagesAction(input: z.infer<typeof reorderSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const reordered = await reorderProductImagesDb(parsed.data.productId, parsed.data.orderedIds);
  if (!reordered.ok) return reordered;
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.image_reorder",
    entity: "product",
    entityId: parsed.data.productId,
    diff: { orderedIds: parsed.data.orderedIds },
  });
  const product = await getAdminProductById(parsed.data.productId);
  if (product) revalidateCatalog(product.slug);
  return { ok: true, message: "Image order saved." };
}

const primarySchema = z.object({ productId: z.number().int().positive(), imageId: z.number().int().positive() });

export async function setPrimaryProductImageAction(input: z.infer<typeof primarySchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = primarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const primary = await setPrimaryProductImageDb(parsed.data.productId, parsed.data.imageId);
  if (!primary.ok) return primary;
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.image_set_primary",
    entity: "product",
    entityId: parsed.data.productId,
    diff: { imageId: parsed.data.imageId },
  });
  const product = await getAdminProductById(parsed.data.productId);
  if (product) revalidateCatalog(product.slug);
  return { ok: true, message: "Primary image set." };
}

const deleteImageSchema = z.object({ imageId: z.number().int().positive(), productId: z.number().int().positive() });

export async function deleteProductImageAction(input: z.infer<typeof deleteImageSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = deleteImageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const result = await deleteProductImageDb(parsed.data.productId, parsed.data.imageId);
  if (!result.ok) return { ok: false, error: result.error };

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.image_delete",
    entity: "product_image",
    entityId: parsed.data.imageId,
    diff: { productId: parsed.data.productId },
  });
  revalidateCatalog(result.productSlug);
  return { ok: true, message: "Image deleted." };
}

const replaceSchema = z.object({
  productId: z.number().int().positive(),
  imageId: z.number().int().positive(),
  tmpKey: z.string().trim().min(1),
});

/** Uploads a new file in place of an existing image — alt text, position and primary flag stay. */
export async function replaceProductImageAction(input: z.infer<typeof replaceSchema>): Promise<AdminResult<{ url: string }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = replaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const result = await replaceProductImageDb(parsed.data.productId, parsed.data.imageId, parsed.data.tmpKey);
    const { publicUrl } = await import("@/lib/storage/storage");
    await writeAuditLog({
      actorUserId: auth.user.id,
      action: "product.image_replace",
      entity: "product_image",
      entityId: parsed.data.imageId,
      diff: { productId: parsed.data.productId, storageKey: result.storageKey },
    });
    revalidatePath(`/admin/products/${parsed.data.productId}`);
    revalidateCatalog(result.productSlug);
    return { ok: true, message: "Image replaced.", data: { url: publicUrl(result.storageKey) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't replace the image." };
  }
}

// -------------------------------------------------------------------------------------------
// Delete: archive (soft), restore, delete permanently
// -------------------------------------------------------------------------------------------

/** "Delete" in the admin: archives the product — gone from the storefront, restorable. Typed
 * confirmation of the slug, like every destructive admin action (CLAUDE.md §9). */
export async function archiveProductAction(id: number, confirmSlug: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const product = await getProductSlugAndStatus(id);
  if (!product) return { ok: false, error: "Product not found." };
  if (confirmSlug.trim() !== product.slug) return { ok: false, error: `Type ${product.slug} exactly to confirm.` };

  await archiveProductDb(id);
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.archive",
    entity: "product",
    entityId: id,
    diff: { slug: product.slug, status: { from: product.status, to: "archived" } },
  });
  revalidateCatalog(product.slug);
  return { ok: true, message: "Product deleted — it's off the site. You can restore it from Archived." };
}

export async function restoreProductAction(id: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const product = await getProductSlugAndStatus(id);
  if (!product) return { ok: false, error: "Product not found." };
  if (product.status !== "archived") return { ok: false, error: "Only an archived product can be restored." };

  await restoreProductDb(id);
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.restore",
    entity: "product",
    entityId: id,
    diff: { slug: product.slug, status: { from: "archived", to: "draft" } },
  });
  revalidateCatalog(product.slug);
  return { ok: true, message: "Product restored as a draft — publish it when it's ready." };
}

export async function deleteProductPermanentlyAction(id: number, confirmSlug: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const product = await getProductSlugAndStatus(id);
  if (!product) return { ok: false, error: "Product not found." };
  if (confirmSlug.trim() !== product.slug) return { ok: false, error: `Type ${product.slug} exactly to confirm.` };

  const result = await deleteProductPermanentlyDb(id);
  if (!result.ok) return result;
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "product.delete",
    entity: "product",
    entityId: id,
    diff: { slug: product.slug },
  });
  revalidateCatalog(product.slug);
  return { ok: true, message: "Product deleted permanently." };
}
