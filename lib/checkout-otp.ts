import "server-only";

/**
 * Email OTP for checkout (client brief, 2026-09-20: verify the customer before an order is placed;
 * delivered by email through Resend because an SMS sender isn't in the approved stack — CLAUDE.md §2).
 *
 * Stateless, so no table: the emailed 6-digit code is bound to the address and an expiry by an HMAC
 * (`challenge`, handed to the browser). Verifying recomputes it; success returns a short-lived
 * `proof` (another HMAC over the address) that /api/checkout requires. Guessing is bounded by the
 * rate limiter on the verify route, not by this module. Signed with ORDER_LINK_SECRET, like
 * lib/order-token.ts.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const CODE_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 60 * 60 * 1000;

function secret(): string {
  const s = process.env.ORDER_LINK_SECRET;
  if (!s) throw new Error("ORDER_LINK_SECRET is not set — required to sign checkout verification.");
  return s;
}

function sign(...parts: (string | number)[]): string {
  return createHmac("sha256", secret()).update(parts.join("|")).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const norm = (email: string) => email.trim().toLowerCase();

export function createOtpChallenge(email: string, now = Date.now()): { code: string; challenge: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const exp = now + CODE_TTL_MS;
  return { code, challenge: `${exp}.${sign("otp", norm(email), exp, code)}` };
}

/** Returns a proof token when `code` matches the challenge for `email`, otherwise null. */
export function verifyOtp(email: string, code: string, challenge: string, now = Date.now()): string | null {
  const [expStr, mac] = challenge.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isFinite(exp) || exp < now) return null;
  if (!safeEqual(mac, sign("otp", norm(email), exp, code.trim()))) return null;
  const proofExp = now + PROOF_TTL_MS;
  return `${proofExp}.${sign("proof", norm(email), proofExp)}`;
}

export function isEmailProofValid(email: string, proof: string | null | undefined, now = Date.now()): boolean {
  if (!proof) return false;
  const [expStr, mac] = proof.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(mac, sign("proof", norm(email), exp));
}
