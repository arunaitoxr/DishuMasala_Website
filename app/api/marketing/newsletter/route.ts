import { NextResponse } from "next/server";
import { z } from "zod";
import { subscribeNewsletter } from "@/lib/db/mutations/marketing";

/**
 * Submission target for components/layout/NewsletterForm.tsx. The footer box used to show "you're on
 * the list" without sending anything anywhere, so every sign-up was lost; it now lands in
 * `newsletter_subs`, visible in Admin → Inbox → Newsletter sign-ups. Same plain Zod-validated public
 * endpoint shape as the contact and bulk-enquiry routes.
 */
const bodySchema = z.object({
  email: z.email("Enter a valid email address").max(320),
  sourcePath: z.string().trim().max(500).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  await subscribeNewsletter(parsed.data.email, parsed.data.sourcePath ? `footer:${parsed.data.sourcePath}` : "footer");
  return NextResponse.json({ ok: true });
}
