import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  listAdminConversations, fetchAdminThread, sendAdminMessage,
  setMessageHidden, setConversationClosed, type Conversation,
} from "../../lib/chat";
import { isApiConfigured } from "../../lib/api";
import { useCompanies } from "../../lib/catalog";
import SearchInput from "../../components/SearchInput";
import ChatThread from "../../components/ChatThread";
import ConversationListItem from "../../components/ConversationListItem";
import { EmptyState } from "./components/EmptyState";
import MobileChatOverlay from "../../components/MobileChatOverlay";
import { useAtLeast } from "../../hooks/useBreakpoint";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import Icon from "../../components/Icon";
import Select from "../../components/Select";

// ══════════════════════════════════════════════════════════════════════════
//  CONVERSATIONS — admin oversight
// ══════════════════════════════════════════════════════════════════════════
//
// The admin view is the only one that shows hidden messages. Hiding takes a
// message away from the customer and the provider without deleting the row —
// the record of what was actually said has to outlive the moderation.

export function ChatTab() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // "" = every company. The server already supports this filter (it existed
  // for the unread-count badge); the only gap was that nothing in the UI let an
  // admin narrow the list to one company themselves.
  const [companyId, setCompanyId] = useState("");
  const companies = useCompanies();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // DM-05: the selected conversation lives in the URL (?c=id), not local
  // state — below lg: this is what turns the old stacked list-over-thread
  // into real push navigation, and it's what lets the browser's own Back
  // button close an open thread instead of leaving the tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("c");
  const active = items.find((c) => c.id === activeId) ?? null;

  // Which of the two panes below actually mounts the ChatThread. They used to
  // both render and hide each other with CSS, which does not unmount anything —
  // so every open conversation ran two initial fetches, two poll loops and two
  // read-marking calls. `lg`, not `md`, because that is the breakpoint this
  // screen's panes use (admin has a wider list column than provider does).
  const isDesktop = useAtLeast("lg");
  // Selecting pushes a history entry (setSearchParams' default). The back
  // arrow in the thread header should undo exactly that push — `navigate(-1)`
  // — so it and the system Back button behave identically. But that's only
  // safe when WE were the ones who pushed it: a page landed on directly at
  // `/admin/chat?c=…` (a future deep link) has no such entry to pop, and
  // `navigate(-1)` would leave the app instead of closing the thread.
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
  // A server message (already a string) or a translation KEY resolved at render.
  // Calling t() inside the callback froze whichever language it was built with,
  // and putting `locale` in the deps would refetch the list on every toggle.
  const [error, setError] = useState<{ text?: string; key?: StringKey } | null>(null);
  const errorText = error?.text ?? (error?.key ? t(locale, error.key) : "");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    setLoading(true);
    listAdminConversations({ q: query.trim() || undefined, companyId: companyId || undefined })
      .then((p) => { setItems(p.data); setError(null); })
      .catch((e) => setError(
        e instanceof Error ? { text: e.message } : { key: "admin_chat_load_error" },
      ))
      .finally(() => setLoading(false));
  }, [query, companyId]);

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
      // `active` is derived from `items`, not its own state — patch the row in
      // place so the derived value (and the list behind it) picks up the change
      // immediately, instead of waiting for `load()`'s round trip.
      setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
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

  const hasFilter = query.trim().length > 0 || companyId.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "admin_chat_search")} />
        </div>
        <Select
          className="!w-auto sm:!min-w-[12rem]"
          triggerClassName="field-input !w-auto !py-2 !min-h-[44px] w-full flex items-center justify-between gap-2 text-start touch-press"
          value={companyId}
          onChange={setCompanyId}
          ariaLabel={t(locale, "admin_chat_filter_company")}
          options={[
            { value: "", label: t(locale, "admin_chat_filter_all_companies") },
            ...companies.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {errorText && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{errorText}</div>
      )}

      {/* DM-05: below lg:, the list-over-thread stack used to be two scrollable
          regions nested vertically — reading a reply meant scrolling past a
          list that scrolls internally to reach a thread that also scrolls
          internally. Both panes have `active` to branch on already, so this is
          a render split, not a rewrite: below lg: only ONE of them is ever
          shown at a time (real push navigation), and lg:+ shows both columns
          exactly as before — the `lg:block`/`lg:flex` on each wrapper is what
          restores the desktop two-column view regardless of `active`. */}
      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4">
        <div className={`bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden ${active ? "hidden lg:block" : ""}`}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState msg={t(locale, hasFilter ? "admin_chat_none_filtered" : "admin_chat_none")} icon="forum" />
          ) : (
            <div className="divide-y divide-outline-variant/15 max-h-[32rem] overflow-y-auto">
              {items.map((c) => (
                <ConversationListItem
                  key={c.id}
                  primary={c.customerName ?? c.refNumber ?? ""}
                  secondary={c.companyName}
                  refNumber={c.refNumber ?? ""}
                  lastMessagePreview={c.lastMessagePreview ?? null}
                  lastMessageSender={c.lastMessageSender ?? null}
                  viewer="admin"
                  lastMessageAt={c.lastMessageAt}
                  // A customer waiting on a reply is the one signal an admin
                  // browsing every company's chat actually wants highlighted —
                  // admins have no unread counter of their own (see markRead).
                  unread={c.providerUnread}
                  closed={c.closed}
                  active={active?.id === c.id}
                  onClick={() => selectConversation(c)}
                />
              ))}
            </div>
          )}
        </div>

        {/* lg:+ only now — below lg: MobileChatOverlay (below) takes over the
            whole screen instead, fixed to the viewport so it can't scroll
            away with the rest of the dashboard. */}
        <div className="hidden lg:block bg-surface-container-lowest rounded-2xl shadow-bloom p-4">
          {/* The wrapper keeps its CSS visibility (the grid layout depends on
              it); only the thread itself is gated, so exactly one mounts. */}
          {active && isDesktop ? (
            <>
              <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-outline-variant/15">
                <div className="min-w-0">
                  <p className="font-bold text-label text-on-surface truncate">{active.companyName}</p>
                  <p className="text-caption text-outline truncate">
                    {active.customerName} · <span className="font-mono">{active.refNumber}</span>
                  </p>
                </div>
                <button
                  onClick={() => void toggleClosed()}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-outline hover:text-error transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-body" aria-hidden="true" translate="no">{active.closed ? "lock_open" : "lock"}</span>
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
              <p className="text-label text-outline">{t(locale, "admin_chat_pick")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Below lg: — WhatsApp-style full-screen takeover, pinned to the
          viewport (not the page) so the input bar can never scroll out of
          view and rides above the on-screen keyboard. */}
      {active && !isDesktop && (
        <MobileChatOverlay
          hiddenFrom="lg"
          header={
            <div className="dashboard-topbar-safe flex items-center justify-between gap-3 px-3 pb-3 border-b border-outline-variant/15 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={closeConversation}
                  className="w-11 h-11 -ms-2.5 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors flex-shrink-0"
                  aria-label={t(locale, "common_back")}
                >
                  <Icon name="arrow_back" className="rtl-flip" />
                </button>
                <div className="min-w-0">
                  <p className="font-bold text-label text-on-surface truncate">{active.companyName}</p>
                  <p className="text-caption text-outline truncate">
                    {active.customerName} · <span className="font-mono">{active.refNumber}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => void toggleClosed()}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-outline hover:text-error transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <span className="material-symbols-outlined text-body" aria-hidden="true" translate="no">{active.closed ? "lock_open" : "lock"}</span>
                {t(locale, active.closed ? "admin_chat_reopen" : "admin_chat_close")}
              </button>
            </div>
          }
        >
          <ChatThread
            key={active.id}
            viewer="admin"
            className="h-full"
            load={loadThread}
            send={sendThread}
            onToggleHidden={toggleHidden}
          />
        </MobileChatOverlay>
      )}
    </div>
  );
}
