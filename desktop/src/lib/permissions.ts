// Mirrors api/src/lib/middleware/withPermission.ts's DESKTOP_PERMISSIONS.
// This is a client-side convenience for hiding nav items / gating routes —
// it is NOT the authorization boundary. Every route this app calls is also
// guarded server-side by desktopOnly(permission, handler); a user who edits
// this file (or the compiled bundle) still gets a 403 from the API, because
// the backend re-checks the same permission independently. See
// lib/auth.tsx's ProtectedRoute for how a 403 is handled when it does happen.
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

export function hasPermission(
  granted: readonly string[] | undefined,
  permission: DesktopPermission,
): boolean {
  return Boolean(granted?.includes(permission));
}
