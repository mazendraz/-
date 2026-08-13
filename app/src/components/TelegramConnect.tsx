import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import {
  getTelegramStatus,
  createTelegramLink,
  disconnectTelegram,
  type TelegramStatus,
  type TelegramScope,
} from "../lib/telegram";

/**
 * How many accounts are linked. The admin endpoint returns no `chats` array (it is
 * single-account by design), so fall back to its boolean.
 */
function chatCount(s: TelegramStatus | "loading"): number {
  if (s === "loading") return 0;
  if (s.chats) return s.chats.length;
  return s.linked ? 1 : 0;
}

/**
 * "Connect Telegram" control, shared by the provider dashboard (links the
 * company) and the admin settings page (links that admin's own account) — pass
 * `scope` to pick which. Mirrors NotificationToggle: self-contained, reads its
 * state on mount, renders nothing when the server has no Telegram configured.
 *
 * Connecting happens in the Telegram app, not here — so after opening the deep link
 * we poll for the linked state rather than leaving the caller staring at a button
 * that never changes.
 */
export default function TelegramConnect({ scope = "provider" }: { scope?: TelegramScope }) {
  const { locale } = useLocale();
  const [status, setStatus] = useState<TelegramStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  // Set only when the browser refused us a tab (pop-up blocker). We then render a
  // real <a> the user can tap, because a link click is always allowed.
  const [manualUrl, setManualUrl] = useState<string | null>(null);
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
    getTelegramStatus(scope)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ configured: false, linked: false }));
    return () => {
      alive = false;
      stopPolling();
    };
  }, [scope, stopPolling]);

  async function connect() {
    setBusy(true);
    setError(null);
    setManualUrl(null);

    // Open the tab NOW, synchronously, while we are still inside the click's
    // user-activation window. Minting the link is an async round trip, and by the
    // time it resolves the activation is spent — iOS Safari and Chrome on Android
    // then silently block the pop-up, which is exactly why this button looked like
    // it "loaded for a second and did nothing" for providers on mobile.
    //
    // No "noopener" in the feature string: with it, browsers hand back null and we
    // would have no handle to navigate. We null the opener on the child instead,
    // which gets the same protection.
    let tab: Window | null = null;
    try {
      tab = window.open("", "_blank");
      if (tab) tab.opener = null;
    } catch {
      tab = null; // blocked outright — the <a> fallback below covers it
    }

    try {
      const url = await createTelegramLink(scope);
      if (!url) {
        tab?.close();
        setError("Telegram isn't configured on the server yet.");
        return;
      }
      if (tab && !tab.closed) {
        tab.location.href = url;
      } else {
        // Pop-up blocked. Don't strand them: the link is already minted and ticking,
        // so surface it as something they can tap.
        setManualUrl(url);
      }

      // The link is redeemed inside Telegram, so watch for it to land. The token
      // expires after 15 minutes; give up well before that so we don't poll forever.
      //
      // We watch the account COUNT, not the linked flag. With several accounts
      // allowed, a company adding its second phone is already `linked: true`, so
      // that flag never changes and the spinner would hang forever.
      setWaiting(true);
      const startedAt = Date.now();
      const baseline = chatCount(status);
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() - startedAt > 3 * 60 * 1000) {
          stopPolling();
          return;
        }
        try {
          const next = await getTelegramStatus(scope);
          if (chatCount(next) > baseline || (!next.chats && next.linked)) {
            setStatus(next);
            setManualUrl(null);
            stopPolling();
          }
        } catch {
          /* transient — keep polling until the deadline */
        }
      }, 3000);
    } catch {
      tab?.close();
      setError(t(locale, "prov_tg_err_create"));
    } finally {
      setBusy(false);
    }
  }

  /** Remove one linked account, or all of them when `chatId` is omitted. */
  async function disconnect(chatId?: string) {
    setBusy(true);
    setError(null);
    setManualUrl(null);
    stopPolling();
    try {
      setStatus(await disconnectTelegram(scope, chatId));
    } catch {
      setError(t(locale, "prov_tg_err_disconnect"));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  if (!status.configured) return null; // server has no bot configured → hide entirely

  const { linked, chats } = status;
  // Provider scope lists accounts and supports adding more; admin scope is a plain
  // connect/disconnect toggle and gets no `chats` from its endpoint.
  const multi = Array.isArray(chats);
  const atMax = multi && status.max !== undefined && chats.length >= status.max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary" aria-hidden="true" translate="no">
          {linked ? "chat" : "send"}
        </span>
        <div className="flex-1">
          <p className="font-label-lg text-label-lg text-on-surface">
            {t(locale, "prov_tg_title")}{" "}
            {linked && (
              <span className="text-primary">
                · {t(locale, "prov_tg_connected")}
                {multi && chats.length > 1 && ` (${chats.length})`}
              </span>
            )}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {multi && linked
              ? t(locale, "prov_tg_multi_desc")
              : t(locale, linked ? "prov_tg_on_desc" : "prov_tg_off_desc")}
          </p>
        </div>
        <button
          type="button"
          // With multiple accounts allowed, the primary action stays "add" even when
          // already linked — removing is per-row below, so this button never has to
          // mean two different things.
          onClick={multi ? connect : linked ? () => disconnect() : connect}
          disabled={busy || (multi && atMax)}
          className={`px-4 py-2 rounded-full text-label transition disabled:opacity-50 ${
            !multi && linked
              ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          {busy
            ? "…"
            : multi
              ? t(locale, linked ? "prov_tg_add" : "prov_tg_connect")
              : t(locale, linked ? "prov_tg_disconnect" : "prov_tg_connect")}
        </button>
      </div>

      {multi && chats.length > 0 && (
        <ul className="flex flex-col gap-1">
          {chats.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl bg-surface-container-high px-3 py-2"
            >
              <span
                className="material-symbols-outlined text-on-surface-variant"
                aria-hidden="true"
                translate="no"
              >
                {"person"}
              </span>
              <span className="flex-1 font-body-sm text-body-sm text-on-surface">
                {c.label || t(locale, "prov_tg_unnamed")}
              </span>
              <button
                type="button"
                onClick={() => disconnect(c.id)}
                disabled={busy}
                className="font-label text-label text-error hover:underline disabled:opacity-50"
              >
                {t(locale, "prov_tg_remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {multi && atMax && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {t(locale, "prov_tg_max_note")}
        </p>
      )}

      {multi && chats.length > 1 && (
        <button
          type="button"
          onClick={() => disconnect()}
          disabled={busy}
          className="self-start font-label text-label text-on-surface-variant hover:underline disabled:opacity-50"
        >
          {t(locale, "prov_tg_remove_all")}
        </button>
      )}

      {/* Not gated on `!linked`: adding a SECOND account happens while already
          linked, and hiding the fallback then would strand them again. */}
      {manualUrl && (
        <>
          <a
            href={manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start px-4 py-2 rounded-full bg-primary text-on-primary text-label hover:opacity-90"
          >
            {t(locale, "prov_tg_open_manual")}
          </a>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t(locale, "prov_tg_open_manual_hint")}
          </p>
        </>
      )}

      {waiting && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {t(locale, "prov_tg_waiting_before")} <strong>{t(locale, "prov_tg_waiting_start")}</strong> {t(locale, "prov_tg_waiting_after")}
        </p>
      )}
      {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
    </div>
  );
}
