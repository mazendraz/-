import { Link } from "react-router-dom";
import Logo from "../../../components/Logo";
import SidebarNav, { type SidebarNavItem } from "../../../components/SidebarNav";
import { type AdminTab, NAV } from "../nav";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

export function SidebarBody({ tab, newCount, reviewBadge, changeBadge, chatBadge, onClose }: {
  tab: AdminTab; newCount: number;
  reviewBadge?: number; changeBadge?: number; chatBadge?: number; onClose?: () => void;
}) {
  const { locale } = useLocale();

  const items: SidebarNavItem<AdminTab>[] = NAV.map((item) => {
    if (item.id === "leads") return { id: item.id, icon: item.icon, label: t(locale, item.labelKey), badge: newCount };
    if (item.id === "reviews") return { id: item.id, icon: item.icon, label: t(locale, item.labelKey), badge: reviewBadge, badgeVariant: "error" };
    if (item.id === "changes") return { id: item.id, icon: item.icon, label: t(locale, item.labelKey), badge: changeBadge, badgeVariant: "warning" };
    // Threads a customer is waiting on — primary rather than error/warning,
    // because it's a "someone is waiting" signal, not a problem to fix.
    if (item.id === "chat") return { id: item.id, icon: item.icon, label: t(locale, item.labelKey), badge: chatBadge, badgeTitle: t(locale, "admin_chat_unread_badge") };
    return { id: item.id, icon: item.icon, label: t(locale, item.labelKey) };
  });

  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-outline-variant/15">
        <Link to="/" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
          <Logo className="h-11 w-11 object-contain rounded-xl flex-shrink-0" width={44} height={44} />
          <div className="min-w-0">
            <p className="font-display font-black text-subhead text-on-surface leading-none truncate">{t(locale, "brand_name")}</p>
            <p className="text-caption font-bold text-secondary ltr:tracking-wide mt-1.5 flex items-center gap-1">
              <Icon name="shield_person" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
              {t(locale, "admin_console")}
            </p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label={t(locale, "nav_close_menu")}>
            <Icon name="close" className="text-outline" />
          </button>
        )}
      </div>

      <SidebarNav items={items} activeId={tab} linkTo={(id) => `/admin/${id}`} onNavigate={onClose} />

      <div className="p-4 border-t border-outline-variant/15 space-y-1">
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-label font-bold text-outline hover:text-on-surface transition-colors">
          <Icon name="arrow_back" className="text-subhead rtl-flip" /> {t(locale, "admin_back_to_site")}
        </Link>
      </div>
    </>
  );
}
