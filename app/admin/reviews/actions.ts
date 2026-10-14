"use server";

/**
 * Review admin actions (PROMPTS.md Phase 8 item 4; client request 2026-10-13): add, edit, publish /
 * hide / back to pending, delete, remove a photo, bulk approve, CSV import. Every one checks staff
 * access, validates with Zod, writes the audit log and refreshes the storefront caches the review
 * appears in (the product page, its rating, the homepage review rail).
 */
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { fromISTDateTimeLocal } from "@/lib/dates";
import {
  bulkApproveReviewsDb,
  createStaffReviewDb,
  deleteReviewDb,
  deleteReviewPhotoDb,
  importReviewsDb,
  setReviewStatusDb,
  updateReviewDb,
  type ReviewStatus,
  type ReviewTarget,
} from "@/lib/db/mutations/admin-reviews";
import { getPendingReviewIds, listProductsForReviewFilter } from "@/lib/db/queries/admin-reviews";
import { matchProduct, parseReviewCsv } from "@/lib/reviews/csv";

export type AdminResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

async function requireStaff() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) {
    return { ok: false as const, error: session.error === "unauthenticated" ? "Sign in required." : "Staff access required." };
  }
  return { ok: true as const, user: session.user };
}

/**
 * A review shows on its product page (cached under `reviews:<productId>`, which also drives the
 * AggregateRating JSON-LD) and in the homepage rail (`reviews`), so both are refreshed — a stale
 * storefront after an admin edit is a bug (CLAUDE.md §3.4).
 */
function refreshReviews(targets: ReviewTarget[]) {
  for (const t of targets) {
    updateTag(`reviews:${t.productId}`);
    if (t.productSlug) revalidatePath(`/product/${t.productSlug}`);
  }
  updateTag("reviews");
  revalidatePath("/");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
}

const STATUS_MESSAGE: Record<ReviewStatus, string> = {
  approved: "Review published — it's on the product page now.",
  rejected: "Review hidden from the site.",
  pending: "Review moved back to pending.",
};

const statusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["pending", "approved", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

/** Publish (approved), hide (rejected) or move back to pending — in any direction, any time. */
export async function setReviewStatusAction(input: z.infer<typeof statusSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const result = await setReviewStatusDb(parsed.data.id, parsed.data.status, auth.user.id);
  if (!result) return { ok: false, error: "Review not found." };
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: `review.${parsed.data.status === "approved" ? "publish" : parsed.data.status === "rejected" ? "hide" : "pending"}`,
    entity: "review",
    entityId: parsed.data.id,
    diff: { status: { from: result.from, to: parsed.data.status }, reason: parsed.data.reason || undefined },
  });
  refreshReviews([result]);
  return { ok: true, message: STATUS_MESSAGE[parsed.data.status] };
}

const bulkSchema = z.object({ productId: z.number().int().positive().optional(), rating: z.number().int().min(1).max(5).optional() });

export async function bulkApproveReviewsAction(input: z.infer<typeof bulkSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const ids = await getPendingReviewIds(parsed.data);
  if (ids.length === 0) return { ok: true, message: "No pending reviews match this filter." };

  const affected = await bulkApproveReviewsDb(ids, auth.user.id);
  await writeAuditLog({ actorUserId: auth.user.id, action: "review.bulk_approve", entity: "review", entityId: "bulk", diff: { count: ids.length, ids } });
  refreshReviews(affected);
  return { ok: true, message: `Published ${ids.length} review${ids.length === 1 ? "" : "s"}.` };
}

const reviewFields = {
  productId: z.coerce.number().int().positive("Choose a product"),
  authorName: z.string().trim().min(1, "Reviewer name is required").max(80),
  email: z.union([z.literal(""), z.email("That email doesn't look right")]).nullable(),
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5),
  title: z.string().trim().max(120).nullable(),
  body: z.string().trim().min(3, "Write the review text").max(4000),
  /** IST datetime-local; empty = now. */
  reviewedAt: z.string().nullable(),
  verifiedBuyer: z.boolean(),
};
const createSchema = z.object({ ...reviewFields, status: z.enum(["pending", "approved", "rejected"]) });
const updateSchema = z.object(reviewFields);

function reviewedAt(value: string | null): Date | null | "invalid" | "future" {
  if (!value) return null;
  const date = fromISTDateTimeLocal(value);
  if (!date) return "invalid";
  return date.getTime() > Date.now() + 60_000 ? "future" : date;
}

/** Staff enter a real review received elsewhere (WhatsApp, phone, a marketplace) — marked `staff`. */
export async function createReviewAction(input: z.infer<typeof createSchema>): Promise<AdminResult<{ id: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const when = reviewedAt(parsed.data.reviewedAt);
  if (when === "invalid") return { ok: false, error: "The review date isn't valid." };
  if (when === "future") return { ok: false, error: "The review date can't be in the future." };

  const created = await createStaffReviewDb(
    { ...parsed.data, email: parsed.data.email || null, title: parsed.data.title || null, reviewedAt: when },
    auth.user.id,
  );
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "review.create",
    entity: "review",
    entityId: created.id,
    diff: { productId: created.productId, rating: parsed.data.rating, status: parsed.data.status },
  });
  refreshReviews([created]);
  return { ok: true, message: "Review added.", data: { id: created.id } };
}

export async function updateReviewAction(id: number, input: z.infer<typeof updateSchema>): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const when = reviewedAt(parsed.data.reviewedAt);
  if (when === "invalid") return { ok: false, error: "The review date isn't valid." };
  if (when === "future") return { ok: false, error: "The review date can't be in the future." };

  const result = await updateReviewDb(id, { ...parsed.data, email: parsed.data.email || null, title: parsed.data.title || null, reviewedAt: when });
  if (!result.ok) return result;
  await writeAuditLog({ actorUserId: auth.user.id, action: "review.update", entity: "review", entityId: id, diff: { rating: parsed.data.rating, productId: parsed.data.productId } });
  refreshReviews([result.before, result.after]);
  return { ok: true, message: "Review saved." };
}

/** Deletes a review for good (typed confirmation: "delete"). */
export async function deleteReviewAction(id: number, confirm: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  if (confirm.trim().toLowerCase() !== "delete") return { ok: false, error: "Type delete to confirm." };

  const deleted = await deleteReviewDb(id);
  if (!deleted) return { ok: false, error: "Review not found." };
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "review.delete",
    entity: "review",
    entityId: id,
    diff: { productId: deleted.productId, authorName: deleted.authorName, rating: deleted.rating },
  });
  refreshReviews([deleted]);
  return { ok: true, message: "Review deleted." };
}

export async function deleteReviewPhotoAction(reviewId: number, photoId: number, confirm: string): Promise<AdminResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  if (confirm.trim().toLowerCase() !== "delete") return { ok: false, error: "Type delete to confirm." };
  const result = await deleteReviewPhotoDb(reviewId, photoId);
  if (!result) return { ok: false, error: "Photo not found." };
  await writeAuditLog({ actorUserId: auth.user.id, action: "review.photo_delete", entity: "review", entityId: reviewId, diff: { photoId } });
  refreshReviews([result]);
  return { ok: true, message: "Photo removed." };
}

// -------------------------------------------------------------------------------------------
// CSV import
// -------------------------------------------------------------------------------------------

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;

export interface CsvPreview {
  ready: number;
  invalid: { line: number; message: string }[];
  unmatched: { line: number; product: string }[];
  sample: { product: string; reviewerName: string; rating: number; review: string; date: string | null }[];
}

async function analyseCsv(text: string) {
  if (text.length > MAX_CSV_BYTES) return { error: "The file is larger than 2 MB — split it into smaller files." } as const;
  const { rows, errors } = parseReviewCsv(text);
  if (rows.length > MAX_ROWS) return { error: `The file has ${rows.length} reviews; import at most ${MAX_ROWS} at a time.` } as const;
  const products = await listProductsForReviewFilter();
  const matched: { row: (typeof rows)[number]; productId: number; productName: string }[] = [];
  const unmatched: CsvPreview["unmatched"] = [];
  for (const row of rows) {
    const product = matchProduct(row.product, products);
    if (product) matched.push({ row, productId: product.id, productName: product.name });
    else unmatched.push({ line: row.line, product: row.product });
  }
  return { matched, unmatched, invalid: errors } as const;
}

/** Step 1: parse and match without writing anything, so staff see exactly what will be imported. */
export async function previewReviewCsvAction(text: string): Promise<AdminResult<CsvPreview>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const result = await analyseCsv(text);
  if ("error" in result) return { ok: false, error: result.error! };
  return {
    ok: true,
    message: "Preview ready.",
    data: {
      ready: result.matched.length,
      invalid: result.invalid.slice(0, 50),
      unmatched: result.unmatched.slice(0, 50),
      sample: result.matched.slice(0, 5).map(({ row, productName }) => ({
        product: productName,
        reviewerName: row.reviewerName,
        rating: row.rating,
        review: row.review,
        date: row.date ? row.date.toISOString().slice(0, 10) : null,
      })),
    },
  };
}

/** Step 2: import every valid, matched row (invalid and unmatched rows are skipped). */
export async function importReviewCsvAction(text: string, publish: boolean): Promise<AdminResult<{ imported: number }>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  const result = await analyseCsv(text);
  if ("error" in result) return { ok: false, error: result.error! };
  if (result.matched.length === 0) return { ok: false, error: "Nothing to import — no valid rows matched a product." };

  const status: ReviewStatus = publish ? "approved" : "pending";
  const affected = await importReviewsDb(
    result.matched.map(({ row, productId }) => ({
      productId,
      authorName: row.reviewerName,
      email: row.email,
      rating: row.rating,
      title: row.title,
      body: row.review,
      reviewedAt: row.date,
    })),
    status,
    auth.user.id,
  );
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: "review.import",
    entity: "review",
    entityId: "bulk",
    diff: { imported: result.matched.length, status, skipped: result.invalid.length + result.unmatched.length },
  });
  refreshReviews(affected);
  const n = result.matched.length;
  return {
    ok: true,
    message: `Imported ${n} review${n === 1 ? "" : "s"}${publish ? " and published them" : " as pending"}.`,
    data: { imported: n },
  };
}
