import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import {
  CUSTOMER_SESSION_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
  signCustomerToken,
} from "@/lib/auth";
import type { ApiCustomer } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

/**
 * Is this request authenticating with a COOKIE rather than a Bearer header?
 *
 * The distinction decides whether the sliding-session renewal below applies, so
 * it has to match how getCustomerUser actually resolved the caller: that
 * function tries the Authorization header FIRST and only then the cookies (see
 * resolveTokens). So a request carrying a bearer token was authenticated by
 * that token, whatever else it also sent, and is not a cookie caller.
 */
function isCookieCaller(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && value) return false;
  return Boolean(
    request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value ??
      request.cookies.get(SESSION_COOKIE)?.value,
  );
}

// GET /api/v1/customer/me → the signed-in customer. 401 if absent/invalid.
//
// The apps call this on launch to decide between the signed-in and signed-out
// shell. It re-reads the row (getCustomerUser does) rather than trusting the
// token's claims, which is what makes a deactivated account fail here on the very
// next launch instead of when the token happens to expire.
//
// Deliberately NOT folded into /auth/me: that one resolves a STAFF user and would
// have to branch on token type, and a route that serves two populations is a
// route where the wrong one eventually gets served.
//
// ── Why this RENEWS the cookie, and why only the cookie ──────────────────────
// The cookie's max-age tracks JWT_TTL, which is deliberately short (a day by
// default) because a session token cannot be recalled once signed. The website
// has no refresh token to trade in — that is issued only to a client that sends
// `device`, i.e. the mobile apps, precisely so the browser never has to hold a
// 60-day credential where XSS could read it. Which left the website with a hard
// cap: sign in, and be signed out again a day later no matter how often you
// visited. That is the "my sign-in isn't saved" complaint.
//
// Re-minting here turns it into a SLIDING session for the browser: this is the
// one endpoint every page load already hits, so an active customer keeps their
// session alive by using the site, while one who stops visiting still falls out
// after JWT_TTL.
//
// ⚠️ It renews for a COOKIE caller ONLY, and that guard is load-bearing rather
// than tidy. While it renewed for anyone, this endpoint was an indefinite
// token-extension oracle: anybody holding a captured access token could call it
// once a day with `Authorization: Bearer <stolen>`, read the fresh JWT straight
// out of the Set-Cookie header, and keep an account open forever. It survived
// sign-out, "sign out this device", "sign out everywhere" and a password reset,
// because every one of those revokes a CustomerSession row and none of them
// could touch a stateless JWT. A stolen token now simply expires, and the two
// mechanisms added alongside this (the `sid` claim and
// CustomerUser.tokensValidFrom) end it sooner than that.
//
// Nothing is lost for the apps: they hold a refresh token, which is the
// supported — and revocable — way to get a new access token.
export const GET = withErrors(
  withCustomerAuth(async (request: NextRequest, _context, customer) => {
    const body: ApiCustomer = customer;
    const res = ok(body, 200, { "Cache-Control": "no-store" });

    if (isCookieCaller(request)) {
      res.cookies.set(
        CUSTOMER_SESSION_COOKIE,
        await signCustomerToken({ sub: customer.id }),
        sessionCookieOptions(),
      );
    }
    return res;
  }),
);
