import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { isApiConfigured } from "../lib/api";
import { fetchAdminNotificationSettings, saveAdminNotificationSettings } from "../lib/settings";

/**
 * Admin-only mute switch for CHAT notifications specifically (push + Telegram).
 * Leads always notify — there is deliberately no toggle for those, and none of
 * this exists on the provider side either (providers asked to keep everything).
 * Self-contained like NotificationToggle: loads its own state, saves on toggle.
 */
export default function AdminChatNotifyToggle() {
  const { locale } = useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<null | "admin_set_chat_notify_error">(null);

  useEffect(() => {
    if (!isApiConfigured()) return;
    let alive = true;
    fetchAdminNotificationSettings()
      .then((s) => { if (alive) setEnabled(s.chatEnabled); })
      .catch(() => { if (alive) setErrorKey("admin_set_chat_notify_error"); });
    return () => { alive = false; };
  }, []);

  if (!isApiConfigured() || enabled === null) return null;

  async function toggle() {
    setBusy(true);
    setErrorKey(null);
    try {
      setEnabled((await saveAdminNotificationSettings({ chatEnabled: !enabled })).chatEnabled);
    } catch {
      setErrorKey("admin_set_chat_notify_error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">
          {enabled ? "forum" : "chat_bubble"}
        </span>
        <div className="flex-1">
          <p className="font-label-lg text-label-lg text-on-surface">
            {t(locale, "admin_set_chat_notify_title")}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t(locale, "admin_set_chat_notify_desc")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`px-4 py-2 rounded-full font-label-md text-label-md transition disabled:opacity-50 ${
            enabled
              ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          {busy ? "…" : t(locale, enabled ? "admin_set_chat_notify_mute" : "admin_set_chat_notify_unmute")}
        </button>
      </div>
      {errorKey && <p className="font-body-sm text-body-sm text-error">{t(locale, errorKey)}</p>}
    </div>
  );
}
