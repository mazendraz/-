import { Link } from "react-router-dom";
import Logo from "../../../components/Logo";
import { type AdminTab, NAV } from "../nav";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";

// ── Sidebar / drawer body (shared by desktop rail and mobile drawer) ──
export function SidebarBody({ tab, onSelect, newCount, reviewBadge, changeBadge, chatBadge, onClose }: {
  tab: AdminTab; onSelect: (id: AdminTab) => void; newCount: number;
  reviewBadge?: number; changeBadge?: number; chatBadge?: number; onClose?: () => void;
}) {
  const { locale } = useLocale();
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-outline-variant/15">
        <Link to="/" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
          <Logo className="h-11 w-11 object-contain rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-display font-black text-[17px] text-on-surface leading-none truncate">Al Assema</p>
            <p className="text-[11px] font-bold text-secondary tracking-wide mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
              {t(locale, "admin_console")}
            </p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label={t(locale, "nav_close_menu")}>
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        )}
      </div>
      <nav className="flex-grow px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = tab === item.id;
          return (
            <button key={item.id} onClick={() => onSelect(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-[14px] font-bold transition-all relative touch-press ${
                active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}>
              {/* Logical `start`/`e`, not left/right: in Arabic the rail is on
                  the right, so a physically-left marker detached from its tab. */}
              {active && <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-e-full" />}
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
              {t(locale, item.labelKey)}
              {item.id === "leads" && newCount > 0 && (
                <span className="ms-auto bg-primary text-on-primary text-[11px] font-bold px-1.5 py-0.5 rounded-full">{newCount}</span>
              )}
              {item.id === "reviews" && (reviewBadge ?? 0) > 0 && (
                <span className="ms-auto bg-error text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">{reviewBadge}</span>
              )}
              {item.id === "changes" && (changeBadge ?? 0) > 0 && (
                <span className="ms-auto bg-amber-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">{changeBadge}</span>
              )}
              {/* Threads a customer is waiting on. Same shape as the badges
                  above; primary rather than error/amber, because it is a
                  "someone is waiting" signal, not a problem to fix. */}
              {item.id === "chat" && (chatBadge ?? 0) > 0 && (
                <span className="ms-auto bg-primary text-on-primary text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  title={t(locale, "admin_chat_unread_badge")}>{chatBadge}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-outline-variant/15 space-y-1">
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-[13px] font-bold text-outline hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> {t(locale, "admin_back_to_site")}
        </Link>
      </div>
    </>
  );
}
