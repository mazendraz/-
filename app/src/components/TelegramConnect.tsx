import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import {
  getTelegramStatus,
  createTelegramLink,
  disconnectTelegram,
  type TelegramStatus,
} from "../lib/telegram";

/**
 * "Connect Telegram" control for the provider dashboard. Mirrors NotificationToggle:
 * self-contained, reads its state on mount, renders nothing when the server has no
 * Telegram configured.
 *
 * Connecting happens in the Telegram app, not here — so after opening the deep link
 * we poll for the linked state rather than leaving the provider staring at a button
 * that never changes.
 */
export default function TelegramConnect() {
  const { locale } = useLocale();
  const [status, setStatus] = useState<TelegramStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaiting(false);
  }, []);

  useEffect(() => {
    let alive = true;
    getTelegramStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ configured: false, linked: false }));
    return () => {
      alive = false;
      stopPolling();
    };
  }, [stopPolling]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const url = await createTelegramLink();
      if (!url) {
        setError("Telegram isn't configured on the server yet.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");

      // The link is redeemed inside Telegram, so watch for it to land. The token
      // expires after 15 minutes; give up well before that so we don't poll forever.
      setWaiting(true);
      const startedAt = Date.now();
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() - startedAt > 3 * 60 * 1000) {
          stopPolling();
          return;
        }
        try {
          const next = await getTelegramStatus();
          if (next.linked) {
            setStatus(next);
            stopPolling();
          }
        } catch {
          /* transient — keep polling until the deadline */
        }
      }, 3000);
    } catch {
      setError(t(locale, "prov_tg_err_create"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    stopPolling();
    try {
      setStatus(await disconnectTelegram());
    } catch {
      setError(t(locale, "prov_tg_err_disconnect"));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  if (!status.configured) return null; // server has no bot configured → hide entirely

  const { linked } = status;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">
          {linked ? "chat" : "send"}
        </span>
        <div className="flex-1">
          <p className="font-label-lg text-label-lg text-on-surface">
            {t(locale, "prov_tg_title")} {linked && <span className="text-primary">· {t(locale, "prov_tg_connected")}</span>}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t(locale, linked ? "prov_tg_on_desc" : "prov_tg_off_desc")}
          </p>
        </div>
        <button
          type="button"
          onClick={linked ? disconnect : connect}
          disabled={busy}
          className={`px-4 py-2 rounded-full font-label-md text-label-md transition disabled:opacity-50 ${
            linked
              ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          {busy ? "…" : t(locale, linked ? "prov_tg_disconnect" : "prov_tg_connect")}
        </button>
      </div>

      {waiting && !linked && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {t(locale, "prov_tg_waiting_before")} <strong>{t(locale, "prov_tg_waiting_start")}</strong> {t(locale, "prov_tg_waiting_after")}
        </p>
      )}
      {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
    </div>
  );
}
