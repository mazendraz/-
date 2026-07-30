import { useCallback, useEffect, useState } from "react";
import {
  listAdminConversations, fetchAdminThread, sendAdminMessage,
  setMessageHidden, setConversationClosed, type Conversation,
} from "../../lib/chat";
import { isApiConfigured } from "../../lib/api";
import SearchInput from "../../components/SearchInput";
import ChatThread from "../../components/ChatThread";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";

// ══════════════════════════════════════════════════════════════════════════
//  CONVERSATIONS — admin oversight
// ══════════════════════════════════════════════════════════════════════════
//
// The admin view is the only one that shows hidden messages. Hiding takes a
// message away from the customer and the provider without deleting the row —
// the record of what was actually said has to outlive the moderation.

export function ChatTab() {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  // A server message (already a string) or a translation KEY resolved at render.
  // Calling t() inside the callback froze whichever language it was built with,
  // and putting `locale` in the deps would refetch the list on every toggle.
  const [error, setError] = useState<{ text?: string; key?: StringKey } | null>(null);
  const errorText = error?.text ?? (error?.key ? t(locale, error.key) : "");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    setLoading(true);
    listAdminConversations({ q: query.trim() || undefined })
      .then((p) => { setItems(p.data); setError(null); })
      .catch((e) => setError(
        e instanceof Error ? { text: e.message } : { key: "admin_chat_load_error" },
      ))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    const id = setTimeout(load, query ? 300 : 0); // debounce typing
    return () => clearTimeout(id);
  }, [load, query]);

  // Stable identities so ChatThread's effects don't restart every render.
  const loadThread = useCallback(
    (after?: number) => fetchAdminThread(active!.id, after),
    [active],
  );
  const sendThread = useCallback(
    (body: string) => sendAdminMessage(active!.id, body),
    [active],
  );
  // Returns the updated message: ChatThread re-renders that row from it, because
  // its delta poll only fetches messages newer than the newest one it holds and
  // can never carry a flag change on an existing row.
  const toggleHidden = useCallback(
    (messageId: string, hidden: boolean) => setMessageHidden(active!.id, messageId, hidden),
    [active],
  );

  async function toggleClosed() {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await setConversationClosed(active.id, !active.closed);
      setActive(updated);
      load();
    } catch (e) {
      setError(e instanceof Error ? { text: e.message } : { key: "admin_chat_update_error" });
    } finally {
      setBusy(false);
    }
  }

  if (!isApiConfigured()) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState msg={t(locale, "admin_chat_needs_api")} icon="cloud_off" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "admin_chat_search")} />

      {errorText && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{errorText}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4">
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState msg={t(locale, "admin_chat_none")} icon="forum" />
          ) : (
            <div className="divide-y divide-outline-variant/15 max-h-[32rem] overflow-y-auto">
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active?.id === c.id ? "bg-primary/8" : "hover:bg-surface-container/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[13.5px] text-on-surface truncate">{c.companyName}</span>
                    {c.closed && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-container text-outline flex-shrink-0">
                        {t(locale, "admin_chat_closed")}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-outline truncate">{c.customerName}</p>
                  <p className="text-[11px] text-outline font-mono truncate">{c.refNumber}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-4">
          {active ? (
            <>
              <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-outline-variant/15">
                <div className="min-w-0">
                  <p className="font-bold text-[14px] text-on-surface truncate">{active.companyName}</p>
                  <p className="text-[12px] text-outline truncate">
                    {active.customerName} · <span className="font-mono">{active.refNumber}</span>
                  </p>
                </div>
                <button
                  onClick={() => void toggleClosed()}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-outline hover:text-error transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">{active.closed ? "lock_open" : "lock"}</span>
                  {t(locale, active.closed ? "admin_chat_reopen" : "admin_chat_close")}
                </button>
              </div>

              {/* Posting here sends as ADMIN — both sides see it came from the
                  platform, not from the other party. */}
              <ChatThread
                key={active.id}
                viewer="admin"
                className="h-[26rem]"
                load={loadThread}
                send={sendThread}
                onToggleHidden={toggleHidden}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-[26rem]">
              <p className="text-[13px] text-outline">{t(locale, "admin_chat_pick")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
