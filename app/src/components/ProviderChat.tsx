import { useCallback, useEffect, useState } from "react";
import {
  listProviderConversations, fetchProviderThread, sendProviderMessage,
  type Conversation,
} from "../lib/chat";
import { isApiConfigured } from "../lib/api";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import { intlLocale } from "../lib/format";
import ChatThread from "./ChatThread";

/**
 * The provider's Messages tab: thread list on the left, conversation on the
 * right.
 *
 * The list shows conversations that EXIST — a request nobody has messaged about
 * yet has no thread. The provider reaches those from the leads tab; keeping this
 * list to real conversations is what stops it becoming a second copy of the
 * leads list.
 */
export default function ProviderChat() {
  const { locale } = useLocale();
  const [items, setItems] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Either a server message (already a string) or a translation KEY resolved at
  // render. Calling t() inside the callback froze the language it was built with.
  const [error, setError] = useState<{ text?: string; key?: StringKey } | null>(null);
  const errorText = error?.text ?? (error?.key ? t(locale, error.key) : "");

  const load = useCallback(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    listProviderConversations()
      .then((rows) => { setItems(rows); setError(null); })
      .catch((e) => setError(
        e instanceof Error ? { text: e.message } : { key: "prov_chat_err_load" },
      ))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  // Stable identity so ChatThread's effects don't re-run every render.
  const loadThread = useCallback(
    (after?: number) => fetchProviderThread(activeId!, after),
    [activeId],
  );
  const sendThread = useCallback(
    (body: string) => sendProviderMessage(activeId!, body).then((m) => { load(); return m; }),
    [activeId, load],
  );

  if (!isApiConfigured()) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0 mt-0.5">info</span>
        <p className="text-body-md text-on-surface-variant text-sm">
          {t(locale, "prov_chat_needs_api")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {errorText && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold mb-3">{errorText}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4">
        {/* Thread list */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
          {items.length === 0 ? (
            <div className="text-center py-12 px-5">
              <span className="material-symbols-outlined text-outline text-[40px] mb-2 block">forum</span>
              <p className="text-[13px] text-outline">
                {t(locale, "prov_chat_empty")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/15 max-h-[30rem] overflow-y-auto">
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-start px-4 py-3 transition-colors ${
                    activeId === c.id ? "bg-primary/8" : "hover:bg-surface-container/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[13.5px] text-on-surface truncate">
                      {c.customerName ?? c.refNumber}
                    </span>
                    {c.providerUnread > 0 && (
                      <span className="bg-error text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {c.providerUnread}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-outline font-mono truncate">{c.refNumber}</p>
                  {c.lastMessageAt && (
                    <p className="text-[11px] text-outline">
                      {new Date(c.lastMessageAt).toLocaleString(intlLocale(locale), {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversation */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-4">
          {activeId ? (
            <ChatThread
              key={activeId}
              viewer="provider"
              className="h-[28rem]"
              load={loadThread}
              send={sendThread}
            />
          ) : (
            <div className="flex items-center justify-center h-[28rem]">
              <p className="text-[13px] text-outline">
                {t(locale, "prov_chat_pick")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
