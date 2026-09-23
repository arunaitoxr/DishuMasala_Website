import "server-only";

/**
 * Generic DB-backed rate limiter for auth-sensitive actions (PROMPTS.md Phase 6 item 1),
 * generalising the counting pattern lib/db/mutations/reviews.ts established in Phase 4
 * (count real rows created within a rolling window — never an in-memory map, CLAUDE.md §11's
 * "this app is meant to run serverless" note applies just as much here). Backed by
 * `auth_attempts` (lib/db/schema/auth.ts).
 */
import { createHash } from "node:crypto";
import { countRecentAuthAttempts } from "@/lib/db/queries/auth-attempts";
import { recordAuthAttempt } from "@/lib/db/mutations/auth-attempts";

export type RateLimitAction = "login" | "register" | "reset_request" | "reset_confirm" | "guest_order_lookup";

function hashIdentifier(kind: "ip" | "email", value: string): string {
  return createHash("sha256").update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

interface RateLimitRule {
  windowMinutes: number;
  maxAttempts: number;
}

/** Ceilings per action. Both the IP and (when present) the email identifier are checked
 * independently against the same rule — either one tripping is enough to reject. */
const RULES: Record<RateLimitAction, RateLimitRule> = {
  login: { windowMinutes: 15, maxAttempts: 10 },
  // Looser than login/reset: registration abuse (mass account creation) is a lower-severity
  // threat than credential stuffing, and this ceiling has to tolerate many real signups sharing
  // one IP (NAT, offices, campuses) without false-positiving legitimate traffic.
  register: { windowMinutes: 60, maxAttempts: 20 },
  reset_request: { windowMinutes: 60, maxAttempts: 5 },
  reset_confirm: { windowMinutes: 60, maxAttempts: 10 },
  guest_order_lookup: { windowMinutes: 15, maxAttempts: 10 },
};

async function countRecent(action: RateLimitAction, identifierHash: string, windowMinutes: number): Promise<number> {
  return countRecentAuthAttempts(action, identifierHash, windowMinutes);
}

async function recordAttempt(action: RateLimitAction, identifierHash: string): Promise<void> {
  await recordAuthAttempt(action, identifierHash);
}

export interface RateLimitCheck {
  ip?: string | null;
  email?: string | null;
}

/**
 * Checks the ceiling for `action` against both `ip` and `email` (whichever are provided), records
 * this attempt against both regardless of outcome (so repeated rejected attempts keep counting —
 * an attacker can't reset the window by getting rejected), and returns whether the caller is
 * allowed to proceed. Always call this BEFORE doing the expensive/sensitive work (password
 * verify, sending an email), never after.
 */
export async function checkRateLimit(action: RateLimitAction, identifiers: RateLimitCheck): Promise<{ allowed: boolean }> {
  const rule = RULES[action];
  const ipHash = identifiers.ip ? hashIdentifier("ip", identifiers.ip) : null;
  const emailHash = identifiers.email ? hashIdentifier("email", identifiers.email) : null;

  const [ipCount, emailCount] = await Promise.all([
    ipHash ? countRecent(action, ipHash, rule.windowMinutes) : Promise.resolve(0),
    emailHash ? countRecent(action, emailHash, rule.windowMinutes) : Promise.resolve(0),
  ]);

  const allowed = ipCount < rule.maxAttempts && emailCount < rule.maxAttempts;

  // Record the attempt regardless of outcome — see doc comment above.
  await Promise.all([
    ipHash ? recordAttempt(action, ipHash) : Promise.resolve(),
    emailHash ? recordAttempt(action, emailHash) : Promise.resolve(),
  ]);

  return { allowed };
}

/** Extracts a best-effort client IP from request headers (same lookup as
 * lib/actions/reviews.ts#hashRequestIp) — never guessed, absent rather than wrong when there's no
 * proxy header (e.g. local dev). */
export function clientIpFromHeaders(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
