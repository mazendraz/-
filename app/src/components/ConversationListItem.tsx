import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { intlLocale } from "../lib/format";
import type { MessageSender } from "../lib/chat";

/**
 * One row in a conversation list — shared by the admin, provider and customer
 * chat screens so all three read the same way ("زي واتساب"): an avatar, who
 * it's with, what was last said (with a "You:" prefix when it was this
 * viewer's own message), when, and an unread badge.
 *
 * Before this, each of the three screens had its own near-identical row
 * (admin/provider showed only a name and a reference number — no idea what was
 * actually said or by whom without opening the thread; the customer's version,
 * built alongside this one, already had the full treatment). One component
 * means a design change lands in three places at once instead of drifting.
 */
export interface ConversationListItemProps {
  /** Bold heading — the OTHER party from this viewer's seat: a customer's name
   *  for an admin/provider row, a company's name for a customer row. */
  primary: string;
  /** Smaller line under the heading. Admin needs BOTH company and customer —
   *  it passes whichever `primary` didn't use. Provider/customer rows omit it:
   *  their own company, or their own identity, needs no separate line. */
  secondary?: string;
  refNumber: string;
  lastMessagePreview: string | null;
  lastMessageSender: MessageSender | null;
  /** Whichever party is looking right now — decides the "You:" prefix. */
  viewer: "admin" | "provider" | "customer";
  lastMessageAt: number | null;
  unread: number;
  closed?: boolean;
  active: boolean;
  onClick: () => void;
}

export default function ConversationListItem({
  primary, secondary, refNumber, lastMessagePreview, lastMessageSender, viewer,
  lastMessageAt, unread, closed, active, onClick,
}: ConversationListItemProps) {
  const { locale } = useLocale();
  const isMine =
    (viewer === "customer" && lastMessageSender === "CUSTOMER") ||
    (viewer === "provider" && lastMessageSender === "PROVIDER") ||
    (viewer === "admin" && lastMessageSender === "ADMIN");

  return (
    <button
      onClick={onClick}
      className={`w-full text-start px-4 py-3 transition-colors touch-press flex items-center gap-3 ${
        active ? "bg-primary/8" : "hover:bg-surface-container/50"
      }`}
    >
      {/* Same avatar-circle style already used for review authors elsewhere in
          the app (ProviderDashboard's review cards) — not a new pattern. */}
      <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[15px] flex-shrink-0">
        {primary.charAt(0).toUpperCase() || "?"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[13.5px] truncate ${unread > 0 ? "font-black text-on-surface" : "font-bold text-on-surface"}`}>
            {primary}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {closed && (
              <span className="material-symbols-outlined text-outline text-[14px]" title={t(locale, "admin_chat_closed")}>
                lock
              </span>
            )}
            {unread > 0 && (
              <span className="bg-primary text-on-primary text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                {unread}
              </span>
            )}
          </div>
        </div>

        {secondary && <p className="text-[11px] text-outline truncate">{secondary}</p>}

        {lastMessagePreview ? (
          <p className={`text-[12px] truncate mt-0.5 ${unread > 0 ? "text-on-surface-variant font-medium" : "text-outline"}`}>
            {isMine && `${t(locale, "messages_you_prefix")} `}
            {lastMessagePreview}
          </p>
        ) : (
          <p className="text-[12px] text-outline mt-0.5 italic">{t(locale, "messages_no_messages_yet")}</p>
        )}

        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-outline font-mono truncate">{refNumber}</span>
          {lastMessageAt && (
            <span className="text-[11px] text-outline ms-auto flex-shrink-0">
              {new Date(lastMessageAt).toLocaleString(intlLocale(locale), {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
