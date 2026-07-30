import { Link } from "react-router-dom";
import { useSaved } from "../hooks/useSaved";
import { useMyLeads, useMyLeadClaims } from "../lib/requests";
import { useCustomerThreads } from "../lib/chat";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

export type PersonalTab = "saved" | "requests" | "messages";

/** Segmented control linking the personal areas: Saved ↔ Requests ↔ Messages. */
export default function PersonalTabs({ active }: { active: PersonalTab }) {
  const { locale } = useLocale();
  const { count: savedCount } = useSaved();
  const requestCount = useMyLeads().length;
  // Unread replies, not thread count: a number next to "Messages" should mean
  // "this many are waiting for you", the same as every other badge in the app.
  const claims = useMyLeadClaims();
  const { totalUnread } = useCustomerThreads(claims);

  const tabs: { key: PersonalTab; labelKey: StringKey; icon: string; to: string; count: number }[] = [
    { key: "saved", labelKey: "saved_tab", icon: "favorite", to: "/saved", count: savedCount },
    { key: "requests", labelKey: "requests_tab", icon: "receipt_long", to: "/requests", count: requestCount },
    { key: "messages", labelKey: "messages_tab", icon: "forum", to: "/messages", count: totalUnread },
  ];

  return (
    <div className="inline-flex bg-surface-container rounded-2xl p-1 mb-7">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold transition-colors
              ${isActive ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>{tab.icon}</span>
            {t(locale, tab.labelKey)}
            {tab.count > 0 && (
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center
                ${isActive ? "bg-primary text-on-primary" : "bg-surface-container-high text-outline"}`}>
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
