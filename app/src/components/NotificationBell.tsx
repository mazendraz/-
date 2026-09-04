import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotificationList,
  useUnreadNotificationCount,
  type ApiStaffNotification,
} from "../lib/notifications";

/**
 * The staff notification center, shared by the provider and admin dashboards.
 *
 * Backed by the real `StaffNotification` table, so read state is server-side:
 * dismissing something here dismisses it on this person's phone too, which is
 * the whole point of persisting rather than deriving the feed (see
 * api/src/lib/services/notifications.staff.service.ts).
 *
 * Deliberately NOT a second nav badge. The sidebar's existing chat/changes/
 * leads badges answer "how much work is queued"; this answers "what happened
 * while I was away" — they overlap in content and differ in purpose, so both
 * stay.
 */
export default function NotificationBell() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { count, refresh } = useUnreadNotificationCount();
  const { items, loading, error, setItems, reload } = useNotificationList(open);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click and on Escape. Escape also returns focus to the
  // trigger — without it, dismissing the panel by keyboard drops focus to the
  // document body and a keyboard user has to tab from the top of the page.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openNotification(n: ApiStaffNotification) {
    setOpen(false);
    if (!n.read) {
      // Optimistic: the row reads as read before the request lands.
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await markNotificationRead(n.id);
        refresh();
      } catch {
        // Reconcile BOTH halves against the server, not just the badge.
        // Refreshing only the count would leave the row showing "read" while
        // the badge still counted it — two views of one fact disagreeing on
        // screen. `reload` re-reads the list, so a failed write undoes its own
        // optimistic edit.
        refresh();
        reload();
      }
    }
    // Server payloads name web dashboard paths ("/provider?tab=messages"), which
    // are exactly this app's own routes — no mapping needed here, unlike the
    // Business App's lib/deepLinks.ts.
    if (n.url) navigate(n.url);
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await markAllNotificationsRead();
      refresh();
    } catch {
      // Same reconciliation as a single failed mark-read above.
      refresh();
      reload();
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        title={t(locale, "notifications_title")}
        aria-label={
          count > 0
            ? `${t(locale, "notifications_title")} (${count})`
            : t(locale, "notifications_title")
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex items-center justify-center bg-surface-container text-on-surface w-11 h-11 min-h-[44px] rounded-xl hover:bg-surface-container-high transition-colors touch-press btn-press"
      >
        <Icon name="notifications" className="text-subhead" fill={count > 0} />
        {count > 0 && (
          <span
            className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-on-error text-caption font-bold flex items-center justify-center"
            // The count is already in the button's aria-label; announcing it
            // twice makes the control read as "Notifications 3 3".
            aria-hidden="true"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t(locale, "notifications_title")}
          // `end-0` not `right-0`: this panel hangs off a topbar button that
          // sits at the inline end in both directions, so it must flip with the
          // document direction rather than pinning to the right in Arabic.
          className="absolute end-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto bg-surface rounded-2xl shadow-lg border border-outline-variant z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant sticky top-0 bg-surface">
            <span className="font-bold text-label text-on-surface">{t(locale, "notifications_title")}</span>
            {items.some((n) => !n.read) && (
              <button
                onClick={markAll}
                className="text-caption font-bold text-primary hover:underline touch-press"
              >
                {t(locale, "notifications_mark_all")}
              </button>
            )}
          </div>

          {loading && (
            <div className="p-4 space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-2/3 rounded bg-surface-container animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-surface-container animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <p className="p-4 text-caption text-on-surface-variant">{t(locale, "notifications_error")}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="p-6 text-caption text-on-surface-variant text-center">
              {t(locale, "notifications_empty")}
            </p>
          )}

          {!loading && !error &&
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-start px-4 py-3 border-b border-outline-variant last:border-b-0 hover:bg-surface-container transition-colors ${n.read ? "" : "bg-primary/5"}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />}
                  <div className={n.read ? "ps-4" : ""}>
                    <p className="font-bold text-label text-on-surface">{n.title}</p>
                    <p className="text-caption text-on-surface-variant">{n.body}</p>
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
