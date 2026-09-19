import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

/**
 * Dev-only: clears storefront cache tags after a `scripts/*` data change. Scripts write straight to
 * Postgres/Storage from outside Next.js, so they cannot call `revalidateTag` themselves — without
 * this, a re-run of `migrate-product-images` or a direct title change stays invisible behind
 * `unstable_cache` until the dev server restarts (or, in production, until an admin save
 * revalidates the same tags).
 *
 *   curl -X POST localhost:3000/api/testing/revalidate -H 'content-type: application/json' \
 *     -d '{"tags":["products","product:premium-herbal-red-tea-teabags"]}'
 *
 * Same guard as the other app/api/testing routes: 404 whenever NODE_ENV is "production", so it is
 * structurally unreachable in a real deployment.
 */
const bodySchema = z.object({
  tags: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
});

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "not_available" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  for (const tag of parsed.data.tags) revalidateTag(tag, { expire: 0 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, revalidated: parsed.data.tags });
}
