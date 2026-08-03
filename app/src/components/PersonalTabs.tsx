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
    // CMP-10: this switches between routes, not panels of one page — a real
    // `<nav>` with `aria-current="page"` is the correct pattern here, not the
    // ARIA tabs pattern (which is for `role="tablist"`/`"tabpanel"` pairs).
    <nav aria-label={t(locale, "personal_nav_label")} className="flex max-w-full overflow-x-auto scrollbar-hide bg-surface-container rounded-2xl p-1 mb-7">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            to={tab.to}
            aria-current={isActive ? "page" : undefined}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-label font-bold whitespace-nowrap transition-colors
              ${isActive ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}
          >
            <span className="material-symbols-outlined text-body" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true" translate="no">{tab.icon}</span>
            {t(locale, tab.labelKey)}
            {tab.count > 0 && (
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-caption font-black flex items-center justify-center
                ${isActive ? "bg-primary text-on-primary" : "bg-surface-container-high text-outline"}`}>
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
