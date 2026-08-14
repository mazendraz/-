// Route composition helpers. `adminOnly` wraps an authed handler with the full
// error → auth → ADMIN-role chain, so admin routes read as:
//
//   export const POST = adminOnly(async (req, ctx, user) => { ... });
import { withErrors } from "@/lib/utils/withErrors";
import { withAuth, type AuthedHandler } from "@/lib/middleware/withAuth";
import { withRole } from "@/lib/middleware/withRole";
import { withPermission, type DesktopPermission } from "@/lib/middleware/withPermission";

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

/**
 * Business Control Center (desktop app) endpoints: requires ADMIN role AND the
 * specific desktop permission, so a PROVIDER account can never reach these
 * regardless of what's in desktopPermissions (defense in depth — that field
 * is meant for admins only, but this doesn't rely on that alone).
 */
export function desktopOnly<Ctx>(
  permission: DesktopPermission,
  handler: AuthedHandler<Ctx>,
): RouteHandler<Ctx> {
  return withErrors(withAuth(withRole("ADMIN", withPermission(permission, handler))));
}
