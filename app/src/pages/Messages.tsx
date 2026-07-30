import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useCustomerThreads, fetchCustomerThread, sendCustomerMessage,
  chatAvailable, POLL_IDLE_MS, type ThreadSummary,
} from "../lib/chat";
import { useMyLeadClaims } from "../lib/requests";
import ChatThread from "../components/ChatThread";
import PersonalTabs from "../components/PersonalTabs";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { intlLocale } from "../lib/format";

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
  usePageMeta("Messages | Al Assema", "Your conversations with the companies you contacted.");

  const claims = useMyLeadClaims();
  const { threads, loading, errorKey, reload } = useCustomerThreads(claims);

  // `?ref=` deep-links straight into one conversation — that is how the button
  // on a request card gets here, so it must land on the thread rather than the
  // list with the customer left to find it again.
  const [params] = useSearchParams();
  const deepLinkRef = params.get("ref");
  const [activeRef, setActiveRef] = useState<string | null>(deepLinkRef);

  const active = threads.find((th) => th.refNumber === activeRef) ?? null;
  const claim = claims.find((c) => c.ref === activeRef);

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
      fetchCustomerThread({ ref: claim!.ref, token: claim!.token, phone: claim!.phone, after }),
    [claim],
  );
  const send = useMemo(
    () => (body: string) =>
      sendCustomerMessage({ ref: claim!.ref, token: claim!.token, phone: claim!.phone, body }),
    [claim],
  );

  const shell = (children: React.ReactNode) => (
    <div className="bg-surface min-h-screen pt-20 md:pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-5">
        <PersonalTabs active="messages" />
        <div className="mb-5">
          <h1 className="font-black text-[26px] md:text-headline-lg text-on-surface tracking-tight mb-1">
            {t(locale, "messages_title")}
          </h1>
          <p className="text-[14px] text-outline">{t(locale, "messages_sub")}</p>
        </div>
        {children}
      </div>
    </div>
  );

  // ── Demo mode: there is no backend to hold a conversation ──
  if (!chatAvailable()) {
    return shell(
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center">
        <span className="material-symbols-outlined text-outline text-[44px] mb-3 block">cloud_off</span>
        <p className="text-[14px] text-outline max-w-sm mx-auto">{t(locale, "messages_needs_api")}</p>
      </div>,
    );
  }

  // ── Loading ──
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
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center">
        <span className="material-symbols-outlined text-error text-[44px] mb-3 block">error</span>
        <p className="text-[14px] text-on-surface-variant mb-5">{t(locale, errorKey)}</p>
        <button onClick={reload}
          className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">
          {t(locale, "common_retry")}
        </button>
      </div>,
    );
  }

  // ── Empty ──
  if (threads.length === 0) {
    return shell(
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-primary text-[34px]">forum</span>
        </div>
        <h2 className="font-bold text-[18px] text-on-surface mb-1.5">{t(locale, "messages_empty_title")}</h2>
        <p className="text-[14px] text-outline mb-6 max-w-xs mx-auto leading-relaxed">
          {t(locale, "messages_empty_sub")}
        </p>
        <Link to="/companies"
          className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">
          {t(locale, "common_browse_companies")}
        </Link>
      </div>,
    );
  }

  return shell(
    <>
      {/* A refresh that fails while rows are already on screen is a banner, not
          a takeover — the conversations below are still readable. */}
      {errorKey && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold mb-3">
          {t(locale, errorKey)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4">
        {/* Thread list — hidden on mobile once a conversation is open */}
        <div className={`bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden ${active ? "hidden md:block" : ""}`}>
          <div className="divide-y divide-outline-variant/15 max-h-[32rem] overflow-y-auto">
            {threads.map((th) => {
              const unread = unreadOf(th);
              const isActive = th.refNumber === activeRef;
              return (
                <button
                  key={th.refNumber}
                  onClick={() => openThread(th.refNumber)}
                  className={`w-full text-start px-4 py-3 transition-colors touch-press ${
                    isActive ? "bg-primary/8" : "hover:bg-surface-container/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13.5px] truncate ${unread > 0 ? "font-black text-on-surface" : "font-bold text-on-surface"}`}>
                      {th.companyName}
                    </span>
                    {unread > 0 && (
                      <span className="bg-primary text-on-primary text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center flex-shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                  {th.lastMessagePreview ? (
                    <p className={`text-[12px] truncate mt-0.5 ${unread > 0 ? "text-on-surface-variant font-medium" : "text-outline"}`}>
                      {th.lastMessageSender === "CUSTOMER" && `${t(locale, "messages_you_prefix")} `}
                      {th.lastMessagePreview}
                    </p>
                  ) : (
                    <p className="text-[12px] text-outline mt-0.5 italic">{t(locale, "messages_no_messages_yet")}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-outline font-mono truncate">{th.refNumber}</span>
                    {th.lastMessageAt && (
                      <span className="text-[11px] text-outline ms-auto flex-shrink-0">
                        {new Date(th.lastMessageAt).toLocaleString(intlLocale(locale), {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation */}
        <div className={`bg-surface-container-lowest rounded-2xl shadow-bloom p-4 ${active ? "" : "hidden md:block"}`}>
          {active && claim ? (
            <>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/15">
                {/* Mobile-only way back to the list, since the list is hidden */}
                <button
                  onClick={() => { setActiveRef(null); reload(); }}
                  className="md:hidden p-1.5 -ms-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0"
                  aria-label={t(locale, "messages_back_to_list")}
                >
                  <span className="material-symbols-outlined text-outline rtl-flip">arrow_back</span>
                </button>
                <div className="min-w-0 flex-1">
                  <Link to={`/companies/${active.companySlug}`}
                    className="font-bold text-[14px] text-on-surface truncate hover:text-primary transition-colors block">
                    {active.companyName}
                  </Link>
                  <p className="text-[12px] text-outline truncate font-mono">{active.refNumber}</p>
                </div>
              </div>
              <ChatThread
                key={active.refNumber}
                viewer="customer"
                className="h-[26rem]"
                load={load}
                send={send}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-[26rem]">
              <p className="text-[13px] text-outline">{t(locale, "messages_pick")}</p>
            </div>
          )}
        </div>
      </div>
    </>,
  );
}
