import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import * as notifications from "@/lib/services/notifications.staff.service";

export const dynamic = "force-dynamic";

// GET /api/v1/notifications → the signed-in staff member's notification center:
// latest rows + unread count. Backs the bell in the web dashboards' provider and
// admin layouts, and the Business App's notifications screen.
//
// ── Why this is not under admin/ or provider/ ──────────────────────────────
// Both roles have exactly one notification center, backed by one table, and the
// rows are already scoped by `userId` — so the usual reason those two prefixes
// are split (`withRole` is strict equality, and the admin/provider routes read
// genuinely different data) does not apply here. `authed` is the correct guard:
// any staff member, their own rows only. Splitting this into two identical
// route trees would be the duplication the rest of the codebase avoids.
//
// Deliberately NOT wrapped in withMaintenance: staff dashboards stay usable
// while the public site is down (see maintenance.ts's own exemption list) —
// blocking the notification center would hide the very alerts an admin needs
// while dealing with whatever caused the maintenance window.
export const GET = authed(async (_request, _context, user) =>
  ok(await notifications.listNotifications(user.id), 200, { "Cache-Control": "no-store" }),
);
