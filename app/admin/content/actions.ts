"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { updateTag } from "next/cache";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { tiptapDocSchema } from "@/lib/content/tiptap-schema";
import {
  createPostDb,
  updatePostDb,
  publishPostDb,
  unpublishPostDb,
  createPageDb,
  updatePageDb,
  publishPageDb,
  unpublishPageDb,
  type PostInput,
  type PageInput,
} from "@/lib/db/mutations/admin-content";
import { isPostSlugTaken, isPageSlugTaken, getAdminPostById, getAdminPageById } from "@/lib/db/queries/admin-content";
import { presignContentImageUpload, finalizeContentImageUpload } from "@/lib/storage/admin-upload";
import { formatDateTime } from "@/lib/dates";

export type AdminResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) {
    return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  }
  return { ok: true as const, user: session.user };
}

function revalidateContent(slug?: string, kind?: "blog" | "recipe") {
  updateTag("posts");
  if (slug) updateTag(`post:${slug}`);
  revalidatePath("/admin/content");
  revalidatePath("/blog");
  revalidatePath("/recipes");
  if (slug && kind === "blog") revalidatePath(`/blog/${slug}`);
  if (slug && kind === "recipe") revalidatePath(`/recipes/${slug}`);
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const postSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(slugPattern, "Lowercase letters, numbers and hyphens only"),
  kind: z.enum(["blog", "recipe"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  excerpt: z.string().trim().max(400).nullable(),
  body: tiptapDocSchema,
  coverStorageKey: z.string().trim().nullable(),
  author: z.string().trim().max(100).nullable(),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(200).nullable(),
  relatedProductIds: z.array(z.number().int().positive()),
});

function toPostDbInput(parsed: z.infer<typeof postSchema>): PostInput {
  return {
    slug: parsed.slug,
    kind: parsed.kind,
    title: parsed.title,
    excerpt: parsed.excerpt || null,
    body: parsed.body,
    coverStorageKey: parsed.coverStorageKey || null,
    author: parsed.author || null,
    seoTitle: parsed.seoTitle || null,
    seoDescription: parsed.seoDescription || null,
    relatedProductIds: parsed.relatedProductIds,
  };
}

export async function checkPostSlugAvailableAction(slug: string, excludeId?: number): Promise<{ available: boolean }> {
  const auth = await requireStaff();
  if (!auth.ok) return { available: false };
  return { available: !(await isPostSlugTaken(slug, excludeId)) };
}

export async function createPostAction(input: z.infer<typeof postSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  if (await isPostSlugTaken(parsed.data.slug)) return { ok: false, error: `The slug "${parsed.data.slug}" is already used.` };

  const dbInput = toPostDbInput(parsed.data);
  const id = await createPostDb(dbInput);
  await writeAuditLog({ actorUserId: auth.user.id, action: "post.create", entity: "post", entityId: id, diff: { slug: dbInput.slug, kind: dbInput.kind } });
  revalidateContent(dbInput.slug, dbInput.kind);
  return { ok: true, message: "Post created as a draft.", data: { id } };
}

export async function updatePostAction(id: number, input: z.infer<typeof postSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await getAdminPostById(id);
  if (!existing) return { ok: false, error: "Post not found." };
  if (await isPostSlugTaken(parsed.data.slug, id)) return { ok: false, error: `The slug "${parsed.data.slug}" is already used.` };

  const dbInput = toPostDbInput(parsed.data);
  await updatePostDb(id, dbInput);
  await writeAuditLog({ actorUserId: auth.user.id, action: "post.update", entity: "post", entityId: id, diff: { slug: dbInput.slug, title: dbInput.title } });
  revalidateContent(existing.slug, existing.kind);
  if (existing.slug !== dbInput.slug) revalidateContent(dbInput.slug, dbInput.kind);
  return { ok: true, message: "Post saved." };
}

const publishSchema = z.object({ id: z.number().int().positive(), publishedAt: z.string().nullable() });

export async function publishPostAction(input: z.infer<typeof publishSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const existing = await getAdminPostById(parsed.data.id);
  if (!existing) return { ok: false, error: "Post not found." };

  const publishedAt = parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null;
  const result = await publishPostDb(parsed.data.id, publishedAt);
  if (!result.ok) return { ok: false, error: result.error };

  const scheduled = publishedAt && publishedAt.getTime() > Date.now();
  await writeAuditLog({ actorUserId: auth.user.id, action: "post.publish", entity: "post", entityId: parsed.data.id, diff: { slug: existing.slug, publishedAt: publishedAt?.toISOString() ?? "now" } });
  revalidateContent(existing.slug, existing.kind);
  return { ok: true, message: scheduled ? `Scheduled for ${formatDateTime(publishedAt!)}.` : "Published — live on the storefront now." };
}

export async function unpublishPostAction(id: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const existing = await getAdminPostById(id);
  if (!existing) return { ok: false, error: "Post not found." };
  await unpublishPostDb(id);
  await writeAuditLog({ actorUserId: auth.user.id, action: "post.unpublish", entity: "post", entityId: id, diff: { slug: existing.slug } });
  revalidateContent(existing.slug, existing.kind);
  return { ok: true, message: "Moved back to draft." };
}

// -------------------------------------------------------------------------------------------
// Pages
// -------------------------------------------------------------------------------------------

const pageSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(slugPattern, "Lowercase letters, numbers and hyphens only"),
  title: z.string().trim().min(1, "Title is required").max(200),
  body: tiptapDocSchema,
});

export async function checkPageSlugAvailableAction(slug: string, excludeId?: number): Promise<{ available: boolean }> {
  const auth = await requireStaff();
  if (!auth.ok) return { available: false };
  return { available: !(await isPageSlugTaken(slug, excludeId)) };
}

export async function createPageAction(input: z.infer<typeof pageSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  if (await isPageSlugTaken(parsed.data.slug)) return { ok: false, error: `The slug "${parsed.data.slug}" is already used.` };

  const dbInput: PageInput = parsed.data;
  const id = await createPageDb(dbInput);
  await writeAuditLog({ actorUserId: auth.user.id, action: "page.create", entity: "page", entityId: id, diff: { slug: dbInput.slug } });
  revalidatePath("/admin/content");
  return { ok: true, message: "Page created as a draft.", data: { id } };
}

export async function updatePageAction(id: number, input: z.infer<typeof pageSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await getAdminPageById(id);
  if (!existing) return { ok: false, error: "Page not found." };
  if (await isPageSlugTaken(parsed.data.slug, id)) return { ok: false, error: `The slug "${parsed.data.slug}" is already used.` };

  await updatePageDb(id, parsed.data);
  await writeAuditLog({ actorUserId: auth.user.id, action: "page.update", entity: "page", entityId: id, diff: { slug: parsed.data.slug } });
  updateTag(`page:${existing.slug}`);
  updateTag("pages");
  revalidatePath(`/${existing.slug}`);
  if (existing.slug !== parsed.data.slug) revalidatePath(`/${parsed.data.slug}`);
  return { ok: true, message: "Page saved." };
}

export async function publishPageAction(id: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const existing = await getAdminPageById(id);
  if (!existing) return { ok: false, error: "Page not found." };
  await publishPageDb(id);
  await writeAuditLog({ actorUserId: auth.user.id, action: "page.publish", entity: "page", entityId: id, diff: { slug: existing.slug } });
  updateTag(`page:${existing.slug}`);
  updateTag("pages");
  revalidatePath(`/${existing.slug}`);
  return { ok: true, message: "Published — live on the storefront now." };
}

export async function unpublishPageAction(id: number): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const existing = await getAdminPageById(id);
  if (!existing) return { ok: false, error: "Page not found." };
  await unpublishPageDb(id);
  await writeAuditLog({ actorUserId: auth.user.id, action: "page.unpublish", entity: "page", entityId: id, diff: { slug: existing.slug } });
  updateTag(`page:${existing.slug}`);
  updateTag("pages");
  revalidatePath(`/${existing.slug}`);
  return { ok: true, message: "Moved back to draft." };
}

// -------------------------------------------------------------------------------------------
// Content images (post cover + inline body images) — same storage flow as products
// -------------------------------------------------------------------------------------------

const presignSchema = z.object({ slug: z.string().trim().min(1), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), contentLength: z.number().int().positive().max(5 * 1024 * 1024) });

export async function presignContentImageUploadAction(input: z.infer<typeof presignSchema>): Promise<AdminResult<{ url: string; tmpKey: string }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = presignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const result = await presignContentImageUpload("posts", parsed.data.slug, parsed.data.contentType, parsed.data.contentLength);
    return { ok: true, message: "Ready to upload.", data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare the upload." };
  }
}

const finalizeSchema = z.object({ slug: z.string().trim().min(1), tmpKey: z.string().trim().min(1) });

export async function finalizeContentImageUploadAction(input: z.infer<typeof finalizeSchema>): Promise<AdminResult<{ url: string; storageKey: string }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const result = await finalizeContentImageUpload("posts", parsed.data.slug, parsed.data.tmpKey);
    return { ok: true, message: "Image uploaded.", data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload processing failed." };
  }
}
