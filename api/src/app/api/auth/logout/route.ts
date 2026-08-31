import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import * as staffSessions from "@/lib/services/staffSession.service";

export const dynamic = "force-dynamic";

// POST /api/auth/logout → 204. Clears the httpOnly session cookie server-side (a
// real logout for cookie auth). Bearer-token clients are stateless, so they also
// drop their token client-side. For hard revocation of a not-yet-expired token,
// deactivate the user (isActive=false) — getAuthUser rejects them on next request.
//
// Also revokes a device session when the caller sends its refreshToken — the
// Business App mobile client's counterpart to the web dashboard's cookie clear.
// Without this, "sign out" on the phone would only forget the token locally,
// leaving a 30-day credential live in whatever copy of it exists elsewhere.
// Mirrors /auth/customer/logout exactly, including staying unauthenticated:
// signing out must work with an access token that has already expired, which
// is exactly when people reach for it — the refresh token in the body is its
// own proof, since you can only revoke a session you hold the token for.
export const POST = withErrors(async (request: NextRequest) => {
  // A body is optional (the website sends none), so a parse failure is not an
  // error — it just means there is no session to revoke.
  const raw = await readJsonObject(request, 4096).catch(() => ({}) as Record<string, unknown>);
  const refreshToken = typeof raw.refreshToken === "string" ? raw.refreshToken : null;

  // Idempotent, and silent about whether the token matched anything: logout
  // must never become a way to test whether a token is live.
  if (refreshToken) await staffSessions.revokeByToken(refreshToken);

  const res = new NextResponse(null, { status: 204 });
  // Expire the cookie immediately (maxAge 0), matching the attributes it was set
  // with so the browser reliably removes it.
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
});
