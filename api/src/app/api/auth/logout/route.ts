import { NextResponse } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";

export const dynamic = "force-dynamic";

// POST /api/auth/logout → 204.
// JWTs are stateless, so logout is primarily client-side: the frontend deletes the
// stored token. Tokens are short-lived (7d). For hard server-side invalidation,
// introduce a denylist (by jti) or shorten the TTL with refresh tokens later.
export const POST = withErrors(async () => new NextResponse(null, { status: 204 }));
