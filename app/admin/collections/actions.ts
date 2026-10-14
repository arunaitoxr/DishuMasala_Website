"use server";

/**
 * Collection admin mutations (PROMPTS.md Phase 8 item 2). The explicitly-checked acceptance
 * criterion here is that changing `priority` visibly reorders the storefront after revalidation —
 * `revalidatePath("/", "layout")` invalidates every route under the root layout in one call (the
 * footer's collection list and `/shop`'s FilterRail facet list are both driven directly by
 * `collections.priority` — see lib/db/queries/collections.ts's `getCollectionsWithStats` and
 * lib/db/queries/shop.ts's facet query — so both reorder live on the very next request, no
 * rebuild/redeploy needed). The homepage's own section order (app/page.tsx) is a deliberate Phase 2
 * editorial template, not a live loop over collections.priority (see that file's own comment) —
 * this phase does not change that design decision.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { updateTag } from "next/cache";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { createCollectionDb, deleteCollectionDb, updateCollectionDb, type CollectionInput } from "@/lib/db/mutations/admin-collections";
import { isCollectionSlugTaken, getAdminCollectionById } from "@/lib/db/queries/admin-collections";

export type AdminResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const collectionSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(slugPattern, "Lowercase letters, numbers and hyphens only"),
  title: z.string().trim().min(1, "Title is required").max(120),
  tagline: z.string().trim().max(200).nullable(),
  priority: z.coerce.number().int().min(1).max(99),
  accentToken: z.string().trim().max(40).nullable(),
  position: z.coerce.number().int().min(0),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(200).nullable(),
});

function revalidateStorefront() {
  revalidatePath("/", "layout");
  updateTag("products");
}

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) {
    return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  }
  return { ok: true as const, user: session.user };
}

export async function checkCollectionSlugAvailableAction(slug: string, excludeId?: number): Promise<{ available: boolean }> {
  const auth = await requireStaff();
  if (!auth.ok) return { available: false };
  return { available: !(await isCollectionSlugTaken(slug, excludeId)) };
}

export async function createCollectionAction(input: z.infer<typeof collectionSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (await isCollectionSlugTaken(parsed.data.slug)) {
    return { ok: false, error: `The slug "${parsed.data.slug}" is already used by another collection.` };
  }

  const dbInput: CollectionInput = { ...parsed.data, tagline: parsed.data.tagline || null, accentToken: parsed.data.accentToken || null, seoTitle: parsed.data.seoTitle || null, seoDescription: parsed.data.seoDescription || null };
  const id = await createCollectionDb(dbInput);

  await writeAuditLog({ actorUserId: auth.user.id, action: "collection.create", entity: "collection", entityId: id, diff: { slug: dbInput.slug, title: dbInput.title, priority: dbInput.priority } });
  revalidateStorefront();
  return { ok: true, message: "Collection created.", data: { id } };
}

export async function updateCollectionAction(id: number, input: z.infer<typeof collectionSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await getAdminCollectionById(id);
  if (!existing) return { ok: false, error: "Collection not found." };

  if (await isCollectionSlugTaken(parsed.data.slug, id)) {
    return { ok: false, error: `The slug "${parsed.data.slug}" is already used by another collection.` };
  }

  const dbInput: CollectionInput = { ...parsed.data, tagline: parsed.data.tagline || null, accentToken: parsed.data.accentToken || null, seoTitle: parsed.data.seoTitle || null, seoDescription: parsed.data.seoDescription || null };
  await updateCollectionDb(id, dbInput);

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "collection.update",
    entity: "collection",
    entityId: id,
    diff: {
      priority: existing.priority === dbInput.priority ? undefined : { from: existing.priority, to: dbInput.priority },
      title: dbInput.title,
    },
  });
  revalidateStorefront();
  return { ok: true, message: "Collection saved — storefront order updated live." };
}

/** Deletes an empty collection (typed confirmation of its slug). */
export async function deleteCollectionAction(id: number, confirmSlug: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const existing = await getAdminCollectionById(id);
  if (!existing) return { ok: false, error: "Collection not found." };
  if (confirmSlug.trim() !== existing.slug) return { ok: false, error: `Type ${existing.slug} exactly to confirm.` };

  const result = await deleteCollectionDb(id);
  if (!result.ok) {
    return {
      ok: false,
      error: `${existing.title} still has ${result.productCount} product${result.productCount === 1 ? "" : "s"} (including drafts and deleted ones). Move them to another collection first.`,
    };
  }
  await writeAuditLog({ actorUserId: auth.user.id, action: "collection.delete", entity: "collection", entityId: id, diff: { slug: existing.slug, title: existing.title } });
  revalidateStorefront();
  revalidatePath("/admin/collections");
  return { ok: true, message: "Collection deleted." };
}
