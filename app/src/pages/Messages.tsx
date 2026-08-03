import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useCustomerThreads, fetchCustomerThread, sendCustomerMessage,
  chatAvailable, POLL_IDLE_MS, type ThreadSummary,
} from "../lib/chat";
import { useMyLeads, useMyLeadClaims, type Lead } from "../lib/requests";
import ChatThread from "../components/ChatThread";
import ConversationListItem from "../components/ConversationListItem";
import PersonalTabs from "../components/PersonalTabs";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";

/**
 * The customer's conversations, all in one place.
 *
 * Before this, chat lived as a collapsible panel inside each request card on "My
 * Requests". That meant a customer could only discover a reply by opening every
 * request one at a time — nothing polled while a panel was collapsed, and the
 * unread counter the API had been maintaining all along was rendered nowhere.
 *
 * Same two-pane shape as the provider and admin chat screens, so all three read
 * the same way. On mobile the panes swap rather than stack: a list and a
 * conversation side by side at 375px would leave neither usable.
 */
export default function Messages() {
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "messages_title")} | ${t(locale, "brand_name")}`, t(locale, "messages_sub"));

  // The full local Lead records (ref, token, phone, companyName/slug — everything
  // needed to open a specific thread) are already in this device's storage the
  // instant a request is submitted. `claims` (ref+token+phone only) feeds the
  // background summaries fetch that builds the LIST; `myLeads` is used directly
  // below so opening ONE specific conversation never has to wait on that fetch.
  const myLeads = useMyLeads();
  const claims = useMyLeadClaims();
  const { threads, loading, errorKey, reload } = useCustomerThreads(claims);

  // `?ref=` deep-links straight into one conversation — that is how the button
  // on a request card and the request-success screen get here.
  const [params] = useSearchParams();
  const deepLinkRef = params.get("ref");
  const [activeRef, setActiveRef] = useState<string | null>(deepLinkRef);

  // Resolved from THIS DEVICE'S OWN LEAD, not from `threads`.
  //
  // `threads` is a network round trip; the list it renders can be slow, briefly
  // empty, or momentarily fail for reasons that have nothing to do with whether
  // this specific conversation exists — a rate-limited retry, a page opened right
  // after the request was submitted, one summary among many failing to resolve.
  // None of that is a reason to block opening a thread the browser can already
  // prove is the customer's own (the reference + tracking token, right here in
  // localStorage, WERE the credential from the moment the request was created).
  //
  // Without this, the earlier version blocked on `threads` even for a same-tab
  // deep link straight from "just submitted" — a fresh network hiccup showed the
  // generic "No conversations yet" screen instead of the one specific
  // conversation the customer had just been sent here to open.
  const activeLead: Lead | undefined = myLeads.find((l) => l.refNumber === activeRef);
  // The richer view (unread count, last-message preview) once the list has it —
  // falls back to the lead's own fields so the header and thread still render
  // immediately even on the very first paint.
  const activeSummary = threads.find((th) => th.refNumber === activeRef);
  const active = activeLead
    ? {
        refNumber: activeLead.refNumber,
        companyName: activeSummary?.companyName || activeLead.companyName,
        companySlug: activeLead.companySlug,
      }
    : null;

  // Opening a thread marks it read server-side, so clear the badge here too
  // rather than leaving a stale count until the next refresh.
  const [readLocally, setReadLocally] = useState<Set<string>>(new Set());
  const openThread = useCallback((ref: string) => {
    setActiveRef(ref);
    setReadLocally((prev) => new Set(prev).add(ref));
  }, []);
  const unreadOf = (th: ThreadSummary) => (readLocally.has(th.refNumber) ? 0 : th.unread);

  // Refresh the list while it is the thing on screen. An open thread does its
  // own polling, so this would only duplicate it — and a hidden tab needs
  // neither.
  useEffect(() => {
    if (!chatAvailable() || activeRef) return;
    const id = setInterval(() => { if (!document.hidden) reload(); }, POLL_IDLE_MS);
    const onVisible = () => { if (!document.hidden) reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeRef, reload]);

  const load = useMemo(
    () => (after?: number) =>
      fetchCustomerThread({
        ref: activeLead!.refNumber, token: activeLead!.trackingToken, phone: activeLead!.phone, after,
      }),
    [activeLead],
  );
  const send = useMemo(
    () => (body: string) =>
      sendCustomerMessage({
        ref: activeLead!.refNumber, token: activeLead!.trackingToken, phone: activeLead!.phone, body,
      }),
    [activeLead],
  );

  const shell = (children: React.ReactNode) => (
    <div className="bg-surface min-h-screen pb-16">
      <div className="max-w-4xl mx-auto px-5">
        <PersonalTabs active="messages" />
        <div className="mb-5">
          <h1 className="font-black text-headline md:text-display text-on-surface tracking-tight mb-1">
            {t(locale, "messages_title")}
          </h1>
          <p className="text-label text-outline">{t(locale, "messages_sub")}</p>
        </div>
        {children}
      </div>
    </div>
  );

  // ── Demo mode: there is no backend to hold a conversation ──
  if (!chatAvailable()) {
    return shell(
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState icon="cloud_off" msg={t(locale, "messages_needs_api")} />
      </div>,
    );
  }

  // ── Deep-linked to a request this device holds, but not (yet, or ever) among
  //     the fetched threads: still open it. See the note on `activeLead` above —
  //     the lead itself is the credential, independent of the summaries fetch.
  if (active) {
    return shell(
      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4">
        {/* List — hidden on mobile once a conversation is open. Shows whatever
            has loaded so far; never blocks the open conversation on its right. */}
        <div className="hidden md:block bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
          {loading && threads.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : (
            <ThreadList threads={threads} activeRef={activeRef} onOpen={openThread} unreadOf={unreadOf} />
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-4">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/15">
            {/* Mobile-only way back to the list, since the list is hidden */}
            <button
              onClick={() => { setActiveRef(null); reload(); }}
              className="md:hidden p-1.5 -ms-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0"
              aria-label={t(locale, "messages_back_to_list")}
            >
              <Icon name="arrow_back" className="text-outline rtl-flip" />
            </button>
            <div className="min-w-0 flex-1">
              <Link to={`/companies/${active.companySlug}`}
                className="font-bold text-label text-on-surface truncate hover:text-primary transition-colors block">
                {active.companyName}
              </Link>
              <p className="text-caption text-outline truncate font-mono">{active.refNumber}</p>
            </div>
          </div>
          <ChatThread
            key={active.refNumber}
            viewer="customer"
            className="h-[26rem]"
            load={load}
            send={send}
          />
        </div>
      </div>,
    );
  }

  // ── A `?ref=` was given, but no lead by that reference exists on this device
  //     (a different browser, cleared storage, or the link is simply wrong).
  //     Distinct from the general empty state: the customer followed a specific
  //     link, so "browse companies" is not the useful next step — going back to
  //     their own request list is.
  if (deepLinkRef && !activeLead) {
    return shell(
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState
          icon="search_off"
          msg={t(locale, "messages_ref_not_found")}
          actionHref={{ label: t(locale, "requests_tab"), to: "/requests" }}
        />
      </div>,
    );
  }

  // ── Loading (list view, nothing deep-linked) ──
  if (loading && threads.length === 0) {
    return shell(
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>,
    );
  }

  // ── Error ──
  if (errorKey && threads.length === 0) {
    return shell(
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState icon="error" tone="error" msg={t(locale, errorKey)} action={{ label: t(locale, "common_retry"), onClick: reload }} />
      </div>,
    );
  }

  // ── Empty ──
  if (threads.length === 0) {
    return shell(
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState
          icon="forum"
          title={t(locale, "messages_empty_title")}
          msg={t(locale, "messages_empty_sub")}
          actionHref={{ label: t(locale, "common_browse_companies"), to: "/companies" }}
        />
      </div>,
    );
  }

  return shell(
    <>
      {/* A refresh that fails while rows are already on screen is a banner, not
          a takeover — the conversations below are still readable. */}
      {errorKey && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold mb-3">
          {t(locale, errorKey)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4">
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
          <ThreadList threads={threads} activeRef={activeRef} onOpen={openThread} unreadOf={unreadOf} />
        </div>
        <div className="hidden md:flex bg-surface-container-lowest rounded-2xl shadow-bloom p-4 items-center justify-center h-[26rem]">
          <p className="text-label text-outline">{t(locale, "messages_pick")}</p>
        </div>
      </div>
    </>,
  );
}

/** The thread list, shared by the "a conversation is open" and "browsing" layouts. */
function ThreadList({ threads, activeRef, onOpen, unreadOf }: {
  threads: ThreadSummary[];
  activeRef: string | null;
  onOpen: (ref: string) => void;
  unreadOf: (th: ThreadSummary) => number;
}) {
  return (
    <div className="divide-y divide-outline-variant/15 max-h-[32rem] overflow-y-auto">
      {threads.map((th) => (
        <ConversationListItem
          key={th.refNumber}
          primary={th.companyName}
          refNumber={th.refNumber}
          lastMessagePreview={th.lastMessagePreview}
          lastMessageSender={th.lastMessageSender}
          viewer="customer"
          lastMessageAt={th.lastMessageAt}
          unread={unreadOf(th)}
          closed={th.closed}
          active={th.refNumber === activeRef}
          onClick={() => onOpen(th.refNumber)}
        />
      ))}
    </div>
  );
}
