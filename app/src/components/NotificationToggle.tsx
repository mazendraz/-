import { useEffect, useState } from "react";
import { getPushState, enablePush, disablePush, type PushState } from "../lib/push";

/**
 * "Enable notifications" control for the dashboards. Self-contained: it reads the
 * current push state on mount and lets the user subscribe/unsubscribe this device.
 * Renders nothing on servers/builds without support; shows a helpful note when the
 * browser blocked notifications or the server has no VAPID keys configured.
 */
export default function NotificationToggle() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      setState(state === "subscribed" ? await disablePush() : await enablePush());
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        This browser doesn't support push notifications. On iPhone, add Al Assema to
        your Home Screen first, then enable notifications.
      </p>
    );
  }

  if (state === "unconfigured") return null; // server has no VAPID keys → hide entirely

  const subscribed = state === "subscribed";
  const denied = state === "denied";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">
          {subscribed ? "notifications_active" : "notifications"}
        </span>
        <div className="flex-1">
          <p className="font-label-lg text-label-lg text-on-surface">
            Push notifications on this device
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {subscribed
              ? "You'll get an alert here for every new lead, even when the dashboard is closed."
              : "Get an instant alert for every new lead — even when the dashboard is closed."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || denied}
          className={`px-4 py-2 rounded-full font-label-md text-label-md transition disabled:opacity-50 ${
            subscribed
              ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          {busy ? "..." : subscribed ? "Disable" : "Enable"}
        </button>
      </div>
      {denied && (
        <p className="font-body-sm text-body-sm text-error">
          Notifications are blocked in your browser settings. Allow them for this site
          to enable alerts.
        </p>
      )}
    </div>
  );
}
