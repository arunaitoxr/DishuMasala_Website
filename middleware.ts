import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchOwnUserRow } from "@/lib/db/session-role";
import { LEGACY_REDIRECTS } from "@/lib/seo/redirects.generated";
import { normalisePath } from "@/lib/seo/parse-redirects";

/**
 * Three jobs, in this order:
 *
 *  1. 301 the old WooCommerce URLs (CLAUDE.md §10). The old site is ranked, so every URL in its
 *     sitemaps either still resolves or is redirected here — a ranked URL with no destination is
 *     a launch blocker. The map is generated from the checked-in `redirects.csv`; see
 *     scripts/generate-redirects.ts. This runs FIRST and is a plain object lookup, so it costs
 *     nothing on the overwhelming majority of requests that aren't legacy URLs.
 *
 *  2. Refresh the Supabase session. Access tokens are short-lived; Server Components cannot set
 *     cookies, so middleware is the only place the rotated token can be written back.
 *
 *  3. Gate `/account/*` (any signed-in user) and `/admin/*` (role `staff` or `admin`) — the FIRST
 *     gate, NOT the only one. Every server action and route handler behind these paths
 *     independently re-verifies via `requireUser()` / `requireStaffOrAdmin()`
 *     (lib/auth/session.ts), because middleware never runs for a server action invoked directly.
 *
 * Steps 2 and 3 only do any work for `/account/*` and `/admin/*`. The matcher is deliberately
 * broad now (it has to be, to catch legacy URLs anywhere on the site), so everything else falls
 * straight through without constructing a Supabase client or touching the network.
 *
 * The role in step 3 is read from Postgres, not from a JWT claim — see lib/db/session-role.ts and
 * CLAUDE.md §12 for why the earlier access-token-hook approach was abandoned.
 */
function redirectToLogin(request: NextRequest, pathname: string) {
  const signIn = request.nextUrl.clone();
  signIn.pathname = "/login";
  signIn.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(signIn);
}

const VISITOR_COOKIE = "visitor_id";

/** A random, first-party id for the on-site activity log (lib/db/schema/marketing.ts) and the
 * landing popup's "already answered" check — httpOnly since nothing on the client ever needs to
 * read the raw value itself (app/api/track/route.ts and the phone-lead route both read it
 * server-side off the request). Uses the Web Crypto global, not `node:crypto` — middleware runs on
 * the Edge runtime, which has the former but not the latter. Runs on every response this function
 * returns, not just the two most-visited paths, so a legacy-URL redirect or a canonicalisation hop
 * on someone's very first request still gets a cookie instead of silently never getting one. */
function ensureVisitorCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (!request.cookies.get(VISITOR_COOKIE)) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- 1. Legacy 301s, and trailing-slash canonicalisation ------------------------------------
  // `next.config.ts` sets `skipTrailingSlashRedirect`, so this is the only place either happens.
  // That is deliberate: the old site's URLs all end in `/`, and letting Next answer those with
  // its own 308 first would make every legacy hit a two-hop 308 -> 301 chain.
  const canonicalPath = normalisePath(pathname);
  const legacyTarget = LEGACY_REDIRECTS[canonicalPath];

  // Built with `new URL(...)` rather than `nextUrl.clone()` + pathname assignment: with
  // `skipTrailingSlashRedirect` on, a cloned NextURL re-applies the request's own trailing slash
  // when serialised, so `/blog/` redirected to `/blog/` — an infinite loop. Constructing the URL
  // from scratch is unambiguous. Query strings are carried over deliberately: old campaign links
  // hold ?utm_* that analytics still wants to see on the destination.
  const redirectTo = (to: string) =>
    ensureVisitorCookie(request, NextResponse.redirect(new URL(`${to}${request.nextUrl.search}`, request.nextUrl.origin), 301));

  if (legacyTarget && legacyTarget !== pathname) return redirectTo(legacyTarget);

  // Not a legacy URL, but still slash-suffixed: canonicalise so `/shop/` and `/shop` don't both
  // render (duplicate content). One 301, no chain.
  if (canonicalPath !== pathname) return redirectTo(canonicalPath);

  // The root layout needs the path to decide whether maintenance mode applies (the admin and the
  // sign-in pages stay reachable); a layout can't read it any other way.
  request.headers.set("x-pathname", pathname);

  const needsRole = pathname.startsWith("/admin");
  const needsSignIn = needsRole || pathname.startsWith("/account");

  // Nothing else to do for public pages — no Supabase client, no round-trip.
  if (!needsSignIn) return ensureVisitorCookie(request, NextResponse.next({ request }));

  // ---- 2. Session refresh ---------------------------------------------------------------------
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).");
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() verifies the JWT signature locally (no round-trip for the identity itself) and
  // performs the token refresh this middleware exists to persist.
  const { data } = await supabase.auth.getClaims();
  const authUserId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  // ---- 3. Gates -------------------------------------------------------------------------------
  if (!authUserId) return redirectToLogin(request, pathname);

  if (needsRole) {
    const appUser = await fetchOwnUserRow(supabase, authUserId);
    // No row, or a customer: not staff. Fails closed, for a real reason.
    if (!appUser || (appUser.role !== "staff" && appUser.role !== "admin")) {
      return redirectToLogin(request, pathname);
    }
  }

  return ensureVisitorCookie(request, response);
}

export const config = {
  // Broad by necessity: legacy URLs live all over the old site, so the redirect map has to be
  // consulted for any page request. Static assets, image optimizer output, API routes and files
  // with an extension are excluded — none of them were ever ranked WordPress page URLs, and
  // running middleware on them would be pure overhead.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
