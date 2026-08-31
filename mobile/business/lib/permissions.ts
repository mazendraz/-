/**
 * Presentation-only permission checks — derived from the server's actual
 * guards (api/src/lib/middleware/{withRole,withPermission,guards}.ts) and
 * documented in full in docs/architecture/business-app/README.md §"Roles
 * and guards" / phase-*.md's permission tables.
 *
 * ⚠️ These decide which TABS and CONTROLS render — never whether an action
 * is allowed. The server is the sole authority; every one of these has a
 * real guard behind it, and this file must never grow a check with no
 * server-side counterpart.
 *
 * ── The one fact every screen in this app has to respect ───────────────────
 * `providerOnly` on the server is `withRole("PROVIDER")` — STRICT equality,
 * not "provider or above". An ADMIN gets 403 on every single
 * `/api/provider/*` route, with no fallback. Admin screens are built on
 * `/api/admin/*` or they don't work — see phase-8-admin-core.md's own
 * callout. `isProvider`/`isAdmin` below are mutually exclusive for exactly
 * this reason; there is no "either" helper, because there is no route that
 * accepts either.
 */
import type { StaffUser } from "./staffAuth";

export function isProvider(user: StaffUser | null): boolean {
  return user?.role === "PROVIDER";
}

export function isAdmin(user: StaffUser | null): boolean {
  return user?.role === "ADMIN";
}

/** A provider with no company linked has no leads, no stats, no chat, no
 *  catalog — every provider screen has to handle this as an explanatory
 *  state, not an error (see api's provider/leads and provider/stats routes,
 *  which return an empty page / 400 respectively for exactly this case). */
export function hasCompany(user: StaffUser | null): boolean {
  return isProvider(user) && Boolean(user?.companyId);
}

/** Only a provider completes a lead directly (POST .../complete, which
 *  captures the final amount and opens the customer's verification gate).
 *  An admin sets status — including Completed — via the shared PATCH
 *  /leads/[id] instead; see phase-3's completion-flow note. */
export function canCompleteLeads(user: StaffUser | null): boolean {
  return isProvider(user);
}

/** Only an admin may delete a lead (DELETE /admin/leads/[id]) or set
 *  Completed directly via PATCH /leads/[id] (requireCompletion is only
 *  waived for admins). */
export function canManageLeadsDirectly(user: StaffUser | null): boolean {
  return isAdmin(user);
}

/** Hiding a chat message and closing a thread are admin-only controls
 *  (DELETE .../messages/[id], PATCH admin/chat/[id]) — must never render
 *  for a provider. */
export function canModerateChat(user: StaffUser | null): boolean {
  return isAdmin(user);
}

/** Change requests, project submissions, reviews, site reviews, feedback —
 *  the phase-9 approvals queue. All admin-only. */
export function canModerate(user: StaffUser | null): boolean {
  return isAdmin(user);
}

/** Company creation/editing, direct (non-change-request) catalog edits,
 *  category management — phase 10. Admin-only; a provider's equivalent
 *  edits always go through a ChangeRequest instead. */
export function canManageCompanies(user: StaffUser | null): boolean {
  return isAdmin(user);
}

/** Staff account management — team screen, phase 11. Deactivating or
 *  deleting a user, granting desktop permissions. */
export function canManageTeam(user: StaffUser | null): boolean {
  return isAdmin(user);
}

/** Maintenance mode, platform settings, legal pages, email templates —
 *  phase 11. Takes the public site down; gate this hard in the UI too. */
export function canManagePlatformSettings(user: StaffUser | null): boolean {
  return isAdmin(user);
}

// ── Business Control Center (desktop) permissions — phase 12 ───────────────
// Mirrors api's withPermission.ts DESKTOP_PERMISSIONS exactly. An admin's
// own `desktopPermissions` array is what api's `GET /auth/me` /
// `POST /auth/login` already returns on ApiUser — nothing new to fetch.
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

/** Requires BOTH admin AND the specific grant — matches api's
 *  `desktopOnly()`, which checks role and permission independently (defense
 *  in depth: a PROVIDER account can never reach these regardless of what a
 *  hand-edited `desktopPermissions` array might contain). Accepts one
 *  permission or a list where ANY ONE suffices, same as the server. */
export function hasDesktopPermission(
  user: StaffUser | null,
  permission: DesktopPermission | readonly DesktopPermission[],
): boolean {
  if (!isAdmin(user)) return false;
  const allowed = Array.isArray(permission) ? permission : [permission];
  const granted = user?.desktopPermissions ?? [];
  return allowed.some((p) => granted.includes(p));
}

/** Any Control Center access at all — used to decide whether the section's
 *  nav entry should render at all for a given admin. */
export function hasAnyDesktopPermission(user: StaffUser | null): boolean {
  if (!isAdmin(user)) return false;
  return (user?.desktopPermissions?.length ?? 0) > 0;
}
