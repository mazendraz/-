import { useCallback, useEffect, useRef, useState } from "react";
import {
  pollInterval, type ChatMessage, type Thread,
} from "../lib/chat";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { intlLocale } from "../lib/format";

/**
 * The conversation view, shared by all three surfaces.
 *
 * Transport is polling with a delta (`after`), not sockets — deliberately, per
 * the plan. The cost control is the BACKOFF: 8s while a conversation is live,
 * 30s once it has been quiet for two minutes, straight back to 8s the moment
 * anyone sends. Polling also stops entirely while the tab is hidden, because a
 * background tab learning about a message a few seconds later costs nothing.
 */

export interface ChatThreadProps {
  /** Fetch the thread; `after` is the newest timestamp the client already holds. */
  load: (after?: number) => Promise<Thread>;
  send: (body: string) => Promise<ChatMessage>;
  /** Which side is looking — decides bubble alignment and the admin extras. */
  viewer: "customer" | "provider" | "admin";
  /**
   * Admin moderation. Omit to hide the controls.
   *
   * Returns the UPDATED message so the row can be re-rendered immediately: the
   * delta poll asks only for messages newer than the newest one held, so a flag
   * change on an existing row would otherwise never arrive.
   */
  onToggleHidden?: (messageId: string, hidden: boolean) => Promise<ChatMessage>;
  className?: string;
}

export default function ChatThread({ load, send, viewer, onToggleHidden, className }: ChatThreadProps) {
  const { locale } = useLocale();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  // Refs, not state: these drive the poll loop and must not restart the effect
  // on every tick.
  const newestRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (added.length === 0) return prev;
      return [...prev, ...added].sort((a, b) => a.createdAt - b.createdAt);
    });
    const newest = Math.max(...incoming.map((m) => m.createdAt));
    if (newest > newestRef.current) {
      newestRef.current = newest;
      lastActivityRef.current = Date.now(); // traffic → stay on the fast cadence
    }
  }, []);

  /**
   * Replace one message in place.
   *
   * Moderation changes a flag on a message that already exists, and the delta
   * poll only ever asks for rows NEWER than the newest one held — so it can never
   * deliver this. Without an in-place update the admin clicked Hide and the UI
   * did not change at all until they navigated away and back.
   */
  const replace = useCallback((updated: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }, []);

  // Initial full read.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((t) => {
        if (!alive) return;
        setMessages(t.messages);
        setClosed(t.conversation.closed);
        newestRef.current = t.messages.reduce((max, m) => Math.max(max, m.createdAt), 0);
        setError("");
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : t(locale, "chat_err_load")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  // Delta poll loop with backoff.
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      // A hidden tab does not need to know yet — and this is the single biggest
      // saving when someone leaves a chat open in a background tab all day.
      if (!document.hidden) {
        try {
          const t = await load(newestRef.current || undefined);
          if (!alive) return;
          merge(t.messages);
          setClosed(t.conversation.closed);
        } catch { /* transient — the next tick retries */ }
      }
      schedule();
    };

    const schedule = () => {
      if (!alive) return;
      timerRef.current = setTimeout(tick, pollInterval(lastActivityRef.current));
    };

    schedule();
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, merge]);

  // Keep the newest message in view, but only when already near the bottom —
  // yanking the viewport while someone is reading history is worse than a
  // missed scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const sent = await send(body);
      setDraft("");
      merge([sent]);
      lastActivityRef.current = Date.now(); // back to the fast cadence
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "chat_err_send"));
    } finally {
      setSending(false);
    }
  }

  const senderLabel = (m: ChatMessage) =>
    t(locale,
      m.sender === "ADMIN" ? "chat_sender_admin"
      : m.sender === "PROVIDER" ? "chat_sender_provider"
      : "chat_sender_customer");

  /** Own messages sit on the trailing edge; `dir` handles RTL for us. */
  const isMine = (m: ChatMessage) =>
    (viewer === "customer" && m.sender === "CUSTOMER") ||
    (viewer === "provider" && m.sender === "PROVIDER") ||
    (viewer === "admin" && m.sender === "ADMIN");

  return (
    <div className={`flex flex-col ${className ?? "h-[26rem]"}`}>
      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-3 py-2 text-[12px] font-bold mb-2">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2.5 px-1 py-2"
        role="log"
        aria-live="polite"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-[13px] text-outline text-center py-8">
            {t(locale, "chat_empty")}
          </p>
        ) : (
          messages.map((m) => {
            const mine = isMine(m);
            const admin = m.sender === "ADMIN";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                    admin
                      ? "bg-secondary/15 text-on-surface border border-secondary/30"
                      : mine
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface"
                  } ${m.hidden ? "opacity-50 line-through" : ""}`}
                >
                  {(admin || viewer === "admin") && (
                    <p className={`text-[10px] font-bold mb-0.5 ${mine && !admin ? "opacity-80" : "text-outline"}`}>
                      {senderLabel(m)}
                      {m.hidden ? ` · ${t(locale, "chat_hidden")}` : ""}
                    </p>
                  )}
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] ${mine && !admin ? "opacity-70" : "text-outline"}`}>
                      {new Date(m.createdAt).toLocaleString(intlLocale(locale), {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    {onToggleHidden && (
                      <button
                        onClick={() => {
                          void onToggleHidden(m.id, !m.hidden)
                            .then(replace)
                            .catch((err) => setError(
                              err instanceof Error ? err.message : t(locale, "chat_err_moderate"),
                            ));
                        }}
                        className="text-[10px] font-bold text-outline hover:text-error transition-colors"
                      >
                        {t(locale, m.hidden ? "chat_unhide" : "chat_hide")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {closed ? (
        <p className="text-[12px] text-outline bg-surface-container rounded-xl px-3 py-2.5 mt-2 text-center">
          {t(locale, "chat_closed")}
        </p>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line — the convention people
              // already expect from every other chat they use.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(e as unknown as React.FormEvent); }
            }}
            rows={1}
            placeholder={t(locale, "chat_placeholder")}
            className="field-input flex-1 resize-none !py-2.5 text-[13.5px]"
          />
          <button
            type="submit" disabled={sending || !draft.trim()}
            className="flex items-center justify-center bg-primary text-on-primary w-11 h-11 rounded-xl hover:bg-primary-container transition-colors disabled:opacity-40 flex-shrink-0"
            aria-label={t(locale, "chat_send")}
          >
            <span className="material-symbols-outlined text-[20px] rtl-flip">send</span>
          </button>
        </form>
      )}
    </div>
  );
}
