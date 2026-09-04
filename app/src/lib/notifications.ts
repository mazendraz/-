// Staff notification center — the web half of the feature whose backend lives
// in api/src/lib/services/notifications.staff.service.ts.
//
// One module for BOTH dashboards. The provider and admin layouts render the
// same bell against the same endpoints because there is one table and the rows
// are scoped by `userId` server-side — see the route's own comment on why this
// is `authed` rather than split across /admin and /provider.
//
// What this replaces: the admin dashboard's nav badges counted unread CHAT and
// FEEDBACK by fetching those lists (see useUnreadChatCount). Those still exist
// and still mean what they meant — "threads waiting on you" — while this is the
// delivery record of everything that was actually pushed, with real read state.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiStaffNotification,
  ApiStaffNotificationsResponse,
} from "@alassema/core";
import { apiGet, apiPatch, apiPost, isApiConfigured } from "./api";

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

// ── Why this polls instead of subscribing to SSE ───────────────────────────
// The staff web dashboards hold no SSE connection today — `useLiveEvents` is
// used only by the CUSTOMER side (Messages.tsx, useAccountLeads.ts). Adding one
// here would open a stream per staff tab, and the staff stream's `admins`
// channel is capped per admin account (api's provider/stream/route.ts, B3): the
// phase-4 work found this live, where a few long-lived dashboard tabs ate the
// budget and an admin's PHONE was then refused — advice to "close a tab" that
// makes no sense on a phone. A badge is not worth spending that budget on.
//
// The Business App does subscribe, because it already holds exactly one
// connection for the whole app and pays no additional cost to use it.
//
// 60s is the same order as the dashboard's other background refreshes, and the
// endpoint returns a single integer.
const POLL_MS = 60_000;

/**
 * The bell's unread badge.
 *
 * Returns `refresh` so an action that changes the count — opening the dropdown,
 * marking one read, marking all read — updates it immediately rather than
 * waiting out the poll interval.
 */
export function useUnreadNotificationCount(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);
  const aliveRef = useRef(true);

  const refresh = useCallback(() => {
    if (!isApiConfigured()) return;
    fetchUnreadCount()
      .then((r) => { if (aliveRef.current) setCount(r.unreadCount); })
      // A badge must never break the nav — same contract as useUnreadChatCount.
      .catch(() => {});
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  return { count, refresh };
}

/** The bell dropdown's list. Fetched lazily — only when actually opened. */
export function useNotificationList(open: boolean) {
  const [items, setItems] = useState<ApiStaffNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!isApiConfigured()) return;
    setLoading(true);
    setError(false);
    fetchNotifications()
      .then((r) => setItems(r.notifications))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return { items, loading, error, reload: load, setItems };
}
