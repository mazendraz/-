import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { hasDesktopPermission } from "@/lib/middleware/withPermission";
import { recentActivity } from "@/lib/services/desktopOverview.service";
import type { ApiNotification, ApiNotificationType, ApiNotificationsResponse } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

// GET /api/admin/notifications → ApiNotificationsResponse. Backs
// Header.tsx's notification bell (a no-op since Stage 1 per its own
// comment: "the backend has no admin notification feed").
//
// Building a REAL notification feed with server-side read receipts would
// need a new Notification table — a real `prisma migrate dev` migration.
// This environment (both the cloud sandbox and the device-bridge shell)
// has no network access to Prisma's binary mirror (see the Stage 8→9 gate
// notes: the same 403 that blocked `prisma generate` here blocks
// `migrate dev` too), so a migration authored here could not be verified
// against a real database before shipping — and a route that references a
// table that was never actually migrated would 500 in production, which is
// worse than not having the feature. Reusing recentActivity() — already
// real, already computed, already merges five live signals — gets a fully
// working notification center with zero migration risk. A persisted
// Notification table with server-side read state is a reasonable next step
// once someone can run the migration against the real database directly.
const LOOKBACK_LIMIT = 40;

const TYPE_PERMISSION: Record<ApiNotificationType, Parameters<typeof hasDesktopPermission>[1]> = {
  new_request: "operations:read",
  service_completed: "operations:read",
  dispute_raised: "operations:read",
  commission_collected: "finance:read",
  new_client: "business:read",
};

const TYPE_TITLE: Record<ApiNotificationType, string> = {
  new_request: "New request",
  service_completed: "Service completed",
  dispute_raised: "Price discrepancy flagged",
  commission_collected: "Commission collected",
  new_client: "New client",
};

const TYPE_PATH: Record<ApiNotificationType, string> = {
  new_request: "/operations/requests",
  service_completed: "/operations/active-work",
  dispute_raised: "/operations/price-discrepancies",
  commission_collected: "/finance/transactions",
  new_client: "/business/clients",
};

export const GET = adminOnly(async (_request, _ctx, user) => {
  const events = await recentActivity(LOOKBACK_LIMIT);
  const notifications: ApiNotification[] = events
    .filter((e) => hasDesktopPermission(user, TYPE_PERMISSION[e.type]))
    .map((e) => ({
      id: e.id,
      type: e.type,
      title: TYPE_TITLE[e.type],
      body: e.label,
      path: TYPE_PATH[e.type],
      occurredAt: e.occurredAt,
    }));
  const body: ApiNotificationsResponse = { notifications };
  return ok(body, 200, { "Cache-Control": "no-store" });
});
