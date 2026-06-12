import { NavLink } from "react-router-dom";
import { useSaved } from "../hooks/useSaved";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

const TABS: { to: string; key: StringKey; icon: string; end: boolean }[] = [
  { to: "/", key: "nav_home", icon: "home", end: true },
  { to: "/services", key: "nav_services", icon: "grid_view", end: false },
  { to: "/saved", key: "nav_saved", icon: "favorite", end: false },
  { to: "/requests", key: "nav_requests", icon: "receipt_long", end: false },
];

export default function BottomNav() {
  const { count } = useSaved();
  const { locale } = useLocale();
  return (
    <nav
      aria-label={t(locale, "nav_more")}
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/97 backdrop-blur-xl border-t border-outline-variant/20 bottom-nav-safe"
    >
      <div className="flex h-14">
        {TABS.map(({ to, key, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors touch-press
              ${isActive ? "text-primary" : "text-outline/70"}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`material-symbols-outlined text-[22px] transition-transform duration-150 ${isActive ? "scale-110" : ""}`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {icon}
                </span>
                {key === "nav_saved" && count > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] min-w-[16px] h-[16px] px-1 bg-error text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                    {count}
                  </span>
                )}
                <span className="text-[10px] font-bold leading-none">{t(locale, key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
