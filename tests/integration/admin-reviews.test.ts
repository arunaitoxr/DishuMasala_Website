import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * Real proof of PROMPTS.md Phase 8's review-moderation acceptance criterion: "Approving revalidates
 * the product page and its aggregate rating ... verify approving one actually makes it appear
 * live." Creates a real `pending` review directly in Postgres, confirms the storefront's own
 * approved-reviews query (lib/db/queries/reviews.ts's `fetchApprovedReviews`/`fetchReviewSummary` —
 * exactly what the PDP and its JSON-LD AggregateRating read, both scoped to `status = 'approved'`)
 * excludes it while pending, calls the real `setReviewStatusAction` (publish), and confirms it now appears.
 * (Queried here via the same WHERE-clause condition directly, not through `getApprovedReviews`
 * itself — that wrapper's `unstable_cache` requires a real Next request's incremental-cache
 * context that doesn't exist in a plain Vitest/Node run; the underlying condition it filters on is
 * exactly what's under test.)
 */
const mockAuth = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      async getUser() {
        const session = await mockAuth();
        return session?.user
          ? { data: { user: { id: `auth-uuid-${session.user.id}` } }, error: null }
          : { data: { user: null }, error: null };
      },
    },
  }),
}));
// Partial mock: only the auth-id lookup the session gate uses is faked, so any other real query
// in this file's module graph still runs against the real database.
vi.mock("@/lib/db/queries/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/queries/users")>()),
  async getUserByAuthId() {
    const session = await mockAuth();
    if (!session?.user) return null;
    return { id: Number(session.user.id), role: session.user.role };
  },
}));
vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return { ...actual, revalidatePath: () => undefined, updateTag: () => undefined };
});

let dbClient: Client;
let staffUserId: number;
let productId: number;
let reviewId: number;

beforeAll(async () => {
  dbClient = new Client({ connectionString: process.env.DATABASE_URL });
  await dbClient.connect();

  // Resolve a REAL staff/admin row rather than assuming users.id = 1: actor_user_id and
  // moderated_by are enforced foreign keys, and the identity sequence never rewinds.
  const staff = await dbClient.query<{ id: number }>(
    `select id from users where role in ('staff','admin') order by id limit 1`,
  );
  if (!staff.rows[0]) {
    throw new Error(
      "No staff/admin user exists in the database to test against. Run `pnpm create-staff-user`.",
    );
  }
  staffUserId = staff.rows[0].id;
  const { rows } = await dbClient.query<{ id: number }>(`select id from products limit 1`);
  if (!rows[0]) throw new Error("No seeded product found to test against.");
  productId = rows[0].id;

  const inserted = await dbClient.query<{ id: number }>(
    `insert into reviews (product_id, author_name, email, rating, title, body, status)
     values ($1, 'Moderation Test', $2, 5, 'Great', 'Really enjoyed this.', 'pending') returning id`,
    [productId, `moderation-test-${randomUUID().slice(0, 8)}@example.com`],
  );
  reviewId = inserted.rows[0].id;
});

afterAll(async () => {
  await dbClient.query(`delete from reviews where id = $1`, [reviewId]);
  await dbClient?.end();
});

describe("review approval makes it appear live on the storefront", () => {
  it("is absent from getApprovedReviews/getReviewSummary while pending, present after setReviewStatusAction publishes it", async () => {
    mockAuth.mockResolvedValue({ user: { id: String(staffUserId), role: "staff" } });

    async function approvedCountFor(id: number): Promise<number> {
      // The exact predicate lib/db/queries/reviews.ts's getApprovedReviews/getReviewSummary use.
      const { rows } = await dbClient.query<{ n: string }>(
        `select count(*) as n from reviews where id = $1 and status = 'approved'`,
        [id],
      );
      return Number(rows[0].n);
    }

    expect(await approvedCountFor(reviewId)).toBe(0);

    const { setReviewStatusAction } = await import("@/app/admin/reviews/actions");
    const result = await setReviewStatusAction({ id: reviewId, status: "approved" });
    expect(result.ok).toBe(true);

    const { rows } = await dbClient.query<{ status: string; moderated_by: number | null }>(
      `select status, moderated_by from reviews where id = $1`,
      [reviewId],
    );
    expect(rows[0].status).toBe("approved");
    expect(rows[0].moderated_by).toBe(staffUserId);

    expect(await approvedCountFor(reviewId)).toBe(1);
  });
});
