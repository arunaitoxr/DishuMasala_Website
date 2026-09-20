import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtpChallenge } from "@/lib/checkout-otp";
import { sendCheckoutOtpEmail } from "@/lib/email";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(200) });

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  const { email } = parsed.data;

  const { allowed } = await checkRateLimit("checkout_otp_send", { ip: clientIpFromHeaders(req.headers), email });
  if (!allowed) {
    return NextResponse.json({ ok: false, message: "Too many codes requested. Please wait a few minutes and try again." }, { status: 429 });
  }

  const { code, challenge } = createOtpChallenge(email);
  const result = await sendCheckoutOtpEmail(email, code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: "We couldn't send the code. Please check the address and try again." }, { status: 502 });
  }
  // No RESEND_API_KEY locally: the send was only logged, so log the code too or nobody can test it.
  if (result.skipped && process.env.NODE_ENV !== "production") console.warn(`[checkout-otp] dev code for ${email}: ${code}`);
  return NextResponse.json({ ok: true, challenge });
}
