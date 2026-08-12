import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { getPushState, enablePush, disablePush, type PushState } from "../lib/push";

/**
 * "Enable notifications" control for the dashboards. Self-contained: it reads the
 * current push state on mount and lets the user subscribe/unsubscribe this device.
 * Renders nothing on servers/builds without support; shows a helpful note when the
 * browser blocked notifications or the server has no VAPID keys configured.
 */
export default function NotificationToggle() {
  const { locale } = useLocale();
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

  // Unsupported browser → render nothing, same as unconfigured.
  //
  // This used to print "this browser doesn't support push notifications; on iPhone
  // add Al Assema to your Home Screen first". It sat at the TOP of the notification
  // preferences card, above the Telegram and email rows, and providers read it as a
  // verdict on the whole card — they stopped reading at "notifications don't work
  // here" and never connected Telegram, which works fine on any browser. A note
  // nobody can act on, placed where it discredits the options that do work, is
  // worse than no note.
  if (state === "unsupported") return null;

  if (state === "unconfigured") return null; // server has no VAPID keys → hide entirely

  const subscribed = state === "subscribed";
  const denied = state === "denied";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary" aria-hidden="true" translate="no">
          {subscribed ? "notifications_active" : "notifications"}
        </span>
        <div className="flex-1">
          <p className="font-label-lg text-label-lg text-on-surface">
            {t(locale, "prov_push_title")}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t(locale, subscribed ? "prov_push_on_desc" : "prov_push_off_desc")}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || denied}
          className={`px-4 py-2 rounded-full font-display text-label transition disabled:opacity-50 ${
            subscribed
              ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          {busy ? "…" : t(locale, subscribed ? "prov_push_disable" : "prov_push_enable")}
        </button>
      </div>
      {denied && (
        <p className="font-body-sm text-body-sm text-error">
          {t(locale, "prov_push_denied")}
        </p>
      )}
    </div>
  );
}
