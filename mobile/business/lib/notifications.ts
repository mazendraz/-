/**
 * Staff notification center — the Business App half of the feature whose
 * backend is api/src/lib/services/notifications.staff.service.ts.
 *
 * Shared by BOTH roles, which is why this is one module rather than the
 * leads.ts / adminLeads.ts split the rest of this app uses: `/notifications` is
 * guarded by `authed` (any staff, own rows only), not by `providerOnly` /
 * `adminOnly`, so there is no second route prefix to reach and no 403 to avoid.
 * See that route's own comment for why it is not split by role.
 *
 * Unlike the WEB dashboard's equivalent, the badge here is driven by SSE rather
 * than polling: this app already holds exactly one live connection for the
 * whole app (see @alassema/mobile-shared's liveEvents.ts), so subscribing costs
 * nothing extra — where a browser tab would have opened a NEW stream against a
 * per-admin connection cap.
 */
import { useCallback, useEffect, useState } from "react";
import type { ApiStaffNotification, ApiStaffNotificationsResponse } from "@alassema/core";
import { apiGet, apiPatch, apiPost, useLiveEvents } from "@alassema/mobile-shared";

export type { ApiStaffNotification };

export function fetchNotifications(): Promise<ApiStaffNotificationsResponse> {
  return apiGet<ApiStaffNotificationsResponse>("/notifications");
}

export function fetchUnreadCount(): Promise<{ unreadCount: number }> {
  return apiGet<{ unreadCount: number }>("/notifications/unread-count");
}

export function markNotificationRead(id: string): Promise<{ read: boolean }> {
  return apiPatch<{ read: boolean }>(`/notifications/${id}`, {});
}

export function markAllNotificationsRead(): Promise<{ cleared: boolean }> {
  return apiPost<{ cleared: boolean }>("/notifications/read-all", {});
}

/**
 * Unread count for the "المزيد" tab's badge.
 *
 * Refetches on every live event rather than counting locally: the event carries
 * ids, never content (the standing rule for this app's SSE — see the screen
 * contract in docs/architecture/business-app/README.md), and the server knows
 * the true count including anything raised while this app was backgrounded.
 */
export function useUnreadNotificationCount(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    fetchUnreadCount()
      .then((r) => setCount(r.unreadCount))
      // A badge must never take a screen down — same contract as liveBadges.ts.
      .catch(() => {});
  }, []);

  useLiveEvents(() => refresh());

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh };
}
