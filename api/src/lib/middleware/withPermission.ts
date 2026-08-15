// Desktop Business Control Center permission gate. Composes alongside the
// existing withRole — see guards.ts's desktopOnly, which requires BOTH the
// ADMIN role AND the specific permission below.
//
// Why a permission array instead of new UserRole values (Owner/Finance/
// Operations/...): the desktop app is a second, more sensitive surface (real
// commission/revenue data) layered on top of the existing web admin — not a
// replacement for it. Folding "Finance" into UserRole would change what every
// existing ADMIN check means across the whole codebase; a separate, additive
// `User.desktopPermissions` array changes nothing for the web admin dashboard
// and is fully reversible.
import { ForbiddenError } from "@/lib/utils/errors";
import type { AuthUser } from "@/lib/auth";
import type { AuthedHandler } from "@/lib/middleware/withAuth";

// One string per desktop module + read/write. Kept as a flat union (not a DB
// enum) so a new module needs no migration — see the desktopPermissions
// comment in schema.prisma.
export const DESKTOP_PERMISSIONS = [
  "overview:read",
  "operations:read",
  "business:read",
  "finance:read",
  "finance:write",
  "analytics:read",
  "reports:read",
  "settings:write",
] as const;

export type DesktopPermission = (typeof DESKTOP_PERMISSIONS)[number];

export function hasDesktopPermission(user: AuthUser, permission: DesktopPermission): boolean {
  return user.desktopPermissions.includes(permission);
}

/** Require a desktop permission; 403 otherwise. Accepts one permission, or a
 *  list of permissions where ANY ONE of them is sufficient — used for routes
 *  whose data is legitimately reachable from more than one nav module (e.g.
 *  a route already gated by "business:read" that the Analytics module's
 *  "analytics:read" screens also read). This only ever ADDS an alternate
 *  valid permission per route; it never removes the check for callers using
 *  the original single-permission form, so no existing grant is widened. */
export function withPermission<Ctx>(
  permission: DesktopPermission | readonly DesktopPermission[],
  handler: AuthedHandler<Ctx>,
): AuthedHandler<Ctx> {
  const allowed = Array.isArray(permission) ? permission : [permission as DesktopPermission];
  return (request, context, user) => {
    if (!allowed.some((p) => hasDesktopPermission(user, p))) {
      throw new ForbiddenError(`Requires one of the desktop permissions: ${allowed.join(", ")}`);
    }
    return handler(request, context, user);
  };
}
