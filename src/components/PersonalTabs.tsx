import { Link } from "react-router-dom";
import { useSaved } from "../hooks/useSaved";
import { useMyLeads } from "../lib/requests";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

/** Segmented control linking the two personal areas: Saved ↔ Requests. */
export default function PersonalTabs({ active }: { active: "saved" | "requests" }) {
  const { locale } = useLocale();
  const { count: savedCount } = useSaved();
  const requestCount = useMyLeads().length;

  const tabs: { key: "saved" | "requests"; labelKey: StringKey; icon: string; to: string; count: number }[] = [
    { key: "saved", labelKey: "saved_tab", icon: "favorite", to: "/saved", count: savedCount },
    { key: "requests", labelKey: "requests_tab", icon: "receipt_long", to: "/requests", count: requestCount },
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
