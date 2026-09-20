import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtp } from "@/lib/checkout-otp";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().max(200),
  code: z.string().trim().regex(/^\d{6}$/),
  challenge: z.string().max(200),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Enter the 6-digit code." }, { status: 400 });
  const { email, code, challenge } = parsed.data;

  const { allowed } = await checkRateLimit("checkout_otp_verify", { ip: clientIpFromHeaders(req.headers), email });
  if (!allowed) {
    return NextResponse.json({ ok: false, message: "Too many attempts. Please wait a few minutes and request a new code." }, { status: 429 });
  }

  const proof = verifyOtp(email, code, challenge);
  if (!proof) return NextResponse.json({ ok: false, message: "That code is incorrect or has expired." }, { status: 400 });
  return NextResponse.json({ ok: true, proof });
}
