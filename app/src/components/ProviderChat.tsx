import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  listProviderConversations, fetchProviderThread, sendProviderMessage,
  type Conversation,
} from "../lib/chat";
import { isApiConfigured } from "../lib/api";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import ChatThread from "./ChatThread";
import ConversationListItem from "./ConversationListItem";
import Pagination from "./Pagination";
import MobileChatOverlay from "./MobileChatOverlay";
import Icon from "./Icon";

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
  const navigate = useNavigate();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  // The thread list is paged. Every request opens a thread eagerly, so this list
  // grows with total requests ever received — it was previously capped at 100
  // server-side with no way to ask for more and nothing on screen saying so.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Either a server message (already a string) or a translation KEY resolved at
  // render. Calling t() inside the callback froze the language it was built with.
  const [error, setError] = useState<{ text?: string; key?: StringKey } | null>(null);
  const errorText = error?.text ?? (error?.key ? t(locale, error.key) : "");

  // DM-05: same push-navigation pattern as admin/ChatTab.tsx — the selected
  // conversation lives in the URL (?c=id) so below md: the list and the
  // thread are never both scrollable regions on screen at once, and the
  // browser's own Back button closes an open thread.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("c");
  const active = items.find((c) => c.id === activeId) ?? null;
  const selectedByUsRef = useRef(false);
  function selectConversation(c: Conversation) {
    selectedByUsRef.current = true;
    setSearchParams({ c: c.id });
  }
  function closeConversation() {
    if (selectedByUsRef.current) navigate(-1);
    else setSearchParams({}, { replace: true });
    selectedByUsRef.current = false;
  }

  const load = useCallback(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    listProviderConversations(page, PAGE_SIZE)
      .then((res) => { setItems(res.data); setTotal(res.meta.total); setError(null); })
      .catch((e) => setError(
        e instanceof Error ? { text: e.message } : { key: "prov_chat_err_load" },
      ))
      .finally(() => setLoading(false));
  }, [page]);
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
        <Icon name="info" className="text-primary text-title flex-shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant">
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
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold mb-3">{errorText}</div>
      )}

      {/* DM-05: below md:, only one of the two panes below is ever shown —
          see admin/ChatTab.tsx for the fuller rationale (same broken-
          nested-scroll pattern, same fix). md:+ is untouched: both columns,
          same as before this phase. */}
      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4">
        {/* Thread list */}
        <div className={`bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden ${active ? "hidden md:block" : ""}`}>
          {items.length === 0 ? (
            <div className="text-center py-12 px-5">
              <Icon name="forum" className="text-outline text-[40px] mb-2 block" />
              <p className="text-label text-outline">
                {t(locale, "prov_chat_empty")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/15 max-h-[30rem] overflow-y-auto">
              {items.map((c) => (
                <ConversationListItem
                  key={c.id}
                  primary={c.customerName ?? c.refNumber ?? ""}
                  refNumber={c.refNumber ?? ""}
                  lastMessagePreview={c.lastMessagePreview ?? null}
                  lastMessageSender={c.lastMessageSender ?? null}
                  viewer="provider"
                  lastMessageAt={c.lastMessageAt}
                  unread={c.providerUnread}
                  closed={c.closed}
                  active={activeId === c.id}
                  onClick={() => selectConversation(c)}
                />
              ))}
            </div>
          )}
          {/* Reachable paging. Sits OUTSIDE the scrolling list so it stays
              visible without hunting for it at the bottom of an inner scroll. */}
          {pageCount > 1 && (
            <div className="px-4 py-3 border-t border-outline-variant/15">
              <Pagination
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                nounKey="noun_conversation"
              />
            </div>
          )}
        </div>

        {/* Conversation — md:+ only now. Below md:, MobileChatOverlay takes
            over the whole screen instead, fixed to the viewport so it can't
            scroll away with the rest of the dashboard. */}
        <div className="hidden md:block bg-surface-container-lowest rounded-2xl shadow-bloom p-4">
          {active ? (
            <ChatThread
              key={active.id}
              viewer="provider"
              className="h-[28rem]"
              load={loadThread}
              send={sendThread}
            />
          ) : (
            <div className="flex items-center justify-center h-[28rem]">
              <p className="text-label text-outline">
                {t(locale, "prov_chat_pick")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Below md: — WhatsApp-style full-screen takeover, pinned to the
          viewport (not the page) so the input bar can never scroll out of
          view and rides above the on-screen keyboard. */}
      {active && (
        <MobileChatOverlay
          hiddenFrom="md"
          header={
            <div className="dashboard-topbar-safe flex items-center gap-2 px-3 pb-3 border-b border-outline-variant/15 min-w-0 flex-shrink-0">
              <button
                onClick={closeConversation}
                className="w-11 h-11 -ms-2.5 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors flex-shrink-0"
                aria-label={t(locale, "common_back")}
              >
                <Icon name="arrow_back" className="rtl-flip" />
              </button>
              <p className="font-bold text-label text-on-surface truncate">
                {active.customerName ?? active.refNumber ?? ""}
              </p>
            </div>
          }
        >
          <ChatThread
            key={active.id}
            viewer="provider"
            className="h-full"
            load={loadThread}
            send={sendThread}
          />
        </MobileChatOverlay>
      )}
    </div>
  );
}
