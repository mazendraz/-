// Auth middleware for route handlers. Composes with withErrors:
//
//   export const GET = withErrors(withAuth(async (req, ctx, user) => { ... }));
//
// withAuth resolves the user from the Bearer token (401 if absent/invalid) and
// passes it as a third argument to the inner handler.
import type { NextRequest } from "next/server";
import { getAuthUser, type AuthUser } from "@/lib/auth";

/** Inner handler shape: receives the Next request, route context, and the user. */
export type AuthedHandler<Ctx = unknown> = (
  request: NextRequest,
  context: Ctx,
  user: AuthUser,
) => Response | Promise<Response>;

export function withAuth<Ctx>(
  handler: AuthedHandler<Ctx>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    const user = await getAuthUser(request);
    return handler(request, context, user);
  };
}
