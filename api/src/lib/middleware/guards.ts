// Route composition helpers. `adminOnly` wraps an authed handler with the full
// error → auth → ADMIN-role chain, so admin routes read as:
//
//   export const POST = adminOnly(async (req, ctx, user) => { ... });
import { withErrors } from "@/lib/utils/withErrors";
import { withAuth, type AuthedHandler } from "@/lib/middleware/withAuth";
import { withRole } from "@/lib/middleware/withRole";

type RouteHandler<Ctx> = (
  request: import("next/server").NextRequest,
  context: Ctx,
) => Promise<Response>;

/** Any authenticated user (ADMIN or PROVIDER). */
export function authed<Ctx>(handler: AuthedHandler<Ctx>): RouteHandler<Ctx> {
  return withErrors(withAuth(handler));
}

export function adminOnly<Ctx>(handler: AuthedHandler<Ctx>): RouteHandler<Ctx> {
  return withErrors(withAuth(withRole("ADMIN", handler)));
}

export function providerOnly<Ctx>(handler: AuthedHandler<Ctx>): RouteHandler<Ctx> {
  return withErrors(withAuth(withRole("PROVIDER", handler)));
}
