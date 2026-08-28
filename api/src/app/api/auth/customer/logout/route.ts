import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import {
  CUSTOMER_SESSION_COOKIE,
  SESSION_COOKIE,
  isCustomerToken,
  sessionCookieOptions,
} from "@/lib/auth";
import * as sessions from "@/lib/services/customerSession.service";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/customer/logout → 204.
//
// Clears the cookie (the website's credential) AND, when the caller sends its
// refreshToken, revokes that device session server-side. Without the second
// part a mobile "sign out" would only forget the token locally, leaving a
// 60-day credential live in whatever copy of it exists elsewhere.
//
// Unauthenticated on purpose: signing out must work with an access token that
// has already expired, which is exactly when people reach for it. The refresh
// token in the body is its own proof — you can only revoke a session you hold
// the token for.
export const POST = withErrors(async (request: NextRequest) => {
  // A body is optional (the website sends none), so a parse failure is not an
  // error — it just means there is no session to revoke.
  const raw = await readJsonObject(request, 4096).catch(
    () => ({}) as Record<string, unknown>,
  );
  const refreshToken = typeof raw.refreshToken === "string" ? raw.refreshToken : null;

  // Idempotent, and silent about whether the token matched anything: logout
  // must never become a way to test whether a token is live.
  if (refreshToken) await sessions.revokeByToken(refreshToken);

  const res = new NextResponse(null, { status: 204 });
  const expire = { ...sessionCookieOptions(), maxAge: 0 };
  res.cookies.set(CUSTOMER_SESSION_COOKIE, "", expire);

  // The legacy shared cookie, but ONLY when it actually holds this population's
  // token. Clearing it unconditionally would sign an admin out of the dashboard
  // in the same browser — the mirror image of the collision that splitting the
  // two names fixed in the first place.
  const legacy = request.cookies.get(SESSION_COOKIE)?.value;
  if (legacy && (await isCustomerToken(legacy))) {
    res.cookies.set(SESSION_COOKIE, "", expire);
  }
  return res;
});
