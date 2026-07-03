import { NextResponse } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/logout → 204. Clears the httpOnly session cookie server-side (a
// real logout for cookie auth). Bearer-token clients are stateless, so they also
// drop their token client-side. For hard revocation of a not-yet-expired token,
// deactivate the user (isActive=false) — getAuthUser rejects them on next request.
export const POST = withErrors(async () => {
  const res = new NextResponse(null, { status: 204 });
  // Expire the cookie immediately (maxAge 0), matching the attributes it was set
  // with so the browser reliably removes it.
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
});
