import { Link, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useSaved } from "../hooks/useSaved";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import Logo from "./Logo";

const NAV_LINKS: { to: string; key: StringKey }[] = [
  { to: "/services", key: "nav_services" },
  { to: "/companies", key: "nav_companies" },
];

const DRAWER_MAIN: { to: string; key: StringKey; icon: string; end?: boolean }[] = [
  { to: "/", key: "nav_home", icon: "home", end: true },
  { to: "/services", key: "nav_services", icon: "grid_view" },
  { to: "/companies", key: "nav_companies", icon: "verified" },
  { to: "/start", key: "nav_find_match", icon: "auto_awesome" },
];

const DRAWER_PERSONAL: { to: string; key: StringKey; icon: string }[] = [
  { to: "/saved", key: "nav_saved", icon: "favorite" },
  { to: "/requests", key: "nav_requests", icon: "receipt_long" },
];

const DRAWER_MORE: { to: string; key: StringKey; icon: string }[] = [
  { to: "/#reviews", key: "nav_reviews", icon: "reviews" },
  { to: "/#about", key: "nav_about", icon: "info" },
  { to: "/#contact", key: "nav_contact", icon: "mail" },
];

interface Props {
  onOpenSearch: () => void;
}

export default function TopNav({ onOpenSearch }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const { count: savedCount } = useSaved();
  const { locale, setLocale } = useLocale();

  useEffect(() => {
    // rAF-throttle: coalesce scroll events to one state update per frame so we
    // never re-render faster than the browser paints (smooth on low-end mobile).
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 60);
        setScrollProgress(Math.min(y / 80, 1));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSearch]);

  const { containerRef: drawerRef, trapTab: trapDrawerTab } = useDialogA11y(drawerOpen, () => setDrawerOpen(false));
  const solidBg = !isHome || scrolled;

  // Smooth glass nav — frosted blur is always on; background opacity tracks scroll
  // (recomputed per scroll frame, no CSS bg transition, so it follows the scroll
  // without lag). Near-transparent over the hero at the top → translucent white
  // frost as you scroll. Shared by desktop + mobile so both feel identical.
  const p = isHome ? scrollProgress : 1;
  const glassNavStyle: React.CSSProperties = {
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    backgroundColor: `rgba(255,255,255,${(0.04 + p * 0.78).toFixed(3)})`,
    boxShadow: p > 0.06
      ? `0 1px 0 rgba(0,0,0,0.05), 0 4px 24px rgba(0,85,120,${(p * 0.09).toFixed(3)})`
      : "none",
  };

  return (
    <>
      {/* ── Desktop nav ──────────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 w-full z-50 hidden md:flex justify-between items-center
          px-margin-desktop transition-[padding] duration-300
          ${solidBg ? "py-3" : "py-stack-md"}`}
        style={{ ...glassNavStyle, transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
      >
        <div className="flex items-center gap-stack-lg">
          <Link to="/" className="flex items-center gap-3 flex-shrink-0" aria-label="Al Assemah — Home">
            <Logo className="h-14 w-14 object-contain rounded-xl"
              style={{ filter: solidBg ? "none" : "drop-shadow(0 2px 8px rgba(0,0,0,0.35))" }} />
            <span
              className={`text-[22px] font-black leading-none select-none transition-colors
                ${solidBg ? "text-on-surface" : "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"}`}
              style={{ fontFamily: "'Alexandria', 'Cairo', sans-serif", letterSpacing: "-0.01em" }}
            >
              العاصمة
            </span>
          </Link>
          <div className="flex items-center">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.key} to={l.to}
                className={({ isActive }) =>
                  `text-label-md font-bold transition-all duration-200 px-3.5 py-2 rounded-lg mx-0.5
                  ${isActive
                    ? solidBg ? "text-primary" : "text-white"
                    : solidBg ? "text-on-surface-variant hover:text-primary hover:bg-surface-container-low" : "text-white/85 hover:text-white hover:bg-white/10"}`
                }>
                {t(locale, l.key)}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onOpenSearch}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors
              ${solidBg ? "text-on-surface-variant hover:text-primary hover:bg-surface-container-low" : "text-white/85 hover:text-white hover:bg-white/10"}`}
            aria-label="Search">
            <span className="material-symbols-outlined text-[22px]">search</span>
          </button>

          <Link to="/saved"
            className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors
              ${solidBg ? "text-on-surface-variant hover:text-error hover:bg-surface-container-low" : "text-white/85 hover:text-white hover:bg-white/10"}`}
            title={t(locale, "nav_saved")} aria-label={t(locale, "nav_saved")}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: pathname === "/saved" ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
            {savedCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-error text-white text-[10px] font-black rounded-full flex items-center justify-center">{savedCount}</span>}
          </Link>

          <Link to="/requests"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-bold transition-colors
              ${solidBg ? "text-on-surface-variant hover:text-primary hover:bg-surface-container-low" : "text-white/85 hover:text-white hover:bg-white/10"}`}>
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            {t(locale, "nav_requests")}
          </Link>

          <button
            onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            className={`text-label-sm font-bold transition-colors px-2.5 py-1.5 rounded-lg border
              ${solidBg ? "border-outline-variant/40 text-outline hover:text-primary hover:border-primary/40" : "border-white/30 text-white/70 hover:text-white"}`}
            aria-label={locale === "en" ? "Switch to Arabic" : "Switch to English"}
          >
            {t(locale, "lang_switch")}
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 left-0 w-full z-50 flex items-center justify-between
          px-margin-mobile md:hidden py-3"
        style={glassNavStyle}
      >
        {/* Left: hamburger */}
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu"
          className={`p-2 -ml-1 rtl:-ml-0 rtl:-mr-1 rounded-lg transition-colors touch-press ${solidBg ? "text-on-surface hover:bg-surface-container-low" : "text-white"}`}>
          <span className="material-symbols-outlined text-[26px]">menu</span>
        </button>

        {/* Center: brand — absolutely centered regardless of side widths */}
        <Link
          to="/"
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 flex-shrink-0"
          aria-label="Al Assemah — Home"
        >
          <Logo className="h-9 w-9 object-contain rounded-lg"
            style={{ filter: solidBg ? "none" : "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }} />
          <span
            className={`text-[19px] font-black leading-none select-none transition-colors
              ${solidBg ? "text-on-surface" : "text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"}`}
            style={{ fontFamily: "'Alexandria', 'Cairo', sans-serif", letterSpacing: "-0.01em" }}
          >
            العاصمة
          </span>
        </Link>

        {/* Right: search + saved */}
        <div className="flex items-center gap-1">
          <button onClick={onOpenSearch}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors touch-press
              ${solidBg ? "text-on-surface-variant hover:text-primary hover:bg-surface-container-low" : "text-white/85 hover:text-white hover:bg-white/10"}`}
            aria-label="Search">
            <span className="material-symbols-outlined text-[22px]">search</span>
          </button>
          <Link to="/saved" aria-label={t(locale, "nav_saved")}
            className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors ${solidBg ? "text-on-surface-variant hover:text-error hover:bg-surface-container-low" : "text-white/85 hover:text-white hover:bg-white/10"}`}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: pathname === "/saved" ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
            {savedCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-error text-white text-[9px] font-black rounded-full flex items-center justify-center">{savedCount}</span>}
          </Link>
        </div>
      </nav>

      {/* ── Mobile drawer ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-on-background/45 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div ref={drawerRef} onKeyDown={trapDrawerTab}
            className="drawer-left absolute top-0 left-0 rtl:left-auto rtl:right-0 h-full w-72 max-w-[84vw] bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15">
              <Link to="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2.5">
                <Logo className="h-11 w-11 object-contain rounded-xl" />
                <span className="font-display font-black text-[17px] text-on-surface">Al Assema</span>
              </Link>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg hover:bg-surface-container-low transition-colors" aria-label="Close menu">
                <span className="material-symbols-outlined text-outline">close</span>
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-grow overflow-y-auto px-3 py-4 space-y-1">
              {DRAWER_MAIN.map((l) => (
                <DrawerLink key={l.to} to={l.to} label={t(locale, l.key)} icon={l.icon} end={l.end} pathname={pathname} onClick={() => setDrawerOpen(false)} />
              ))}

              <p className="text-[11px] font-black uppercase tracking-wider text-outline px-3 pt-4 pb-1">{t(locale, "nav_my_activity")}</p>
              {DRAWER_PERSONAL.map((l) => (
                <DrawerLink key={l.to} to={l.to} label={t(locale, l.key)} icon={l.icon} pathname={pathname} onClick={() => setDrawerOpen(false)} badge={l.to === "/saved" ? savedCount : 0} />
              ))}

              <p className="text-[11px] font-black uppercase tracking-wider text-outline px-3 pt-4 pb-1">{t(locale, "nav_more")}</p>
              {DRAWER_MORE.map((l) => (
                <DrawerLink key={l.to} to={l.to} label={t(locale, l.key)} icon={l.icon} pathname={pathname} onClick={() => setDrawerOpen(false)} />
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant/15 space-y-2">
              <Link to="/services" onClick={() => setDrawerOpen(false)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary font-bold text-[14px] py-3 rounded-xl touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">search</span>
                {t(locale, "nav_browse_services")}
              </Link>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setLocale(locale === "en" ? "ar" : "en")}
                  className="text-[12px] font-bold text-outline py-1.5 px-2.5 rounded-lg border border-outline-variant/40 hover:text-primary hover:border-primary/40 transition-colors"
                  aria-label={locale === "en" ? "Switch to Arabic" : "Switch to English"}
                >
                  {t(locale, "lang_switch")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DrawerLink({ to, label, icon, end, pathname, onClick, badge = 0 }: {
  to: string; label: string; icon: string; end?: boolean; pathname: string; onClick: () => void; badge?: number;
}) {
  const active = end ? pathname === to : (to.startsWith("/#") ? false : pathname.startsWith(to));
  return (
    <Link to={to} onClick={onClick}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-bold transition-colors relative ${
        active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
      }`}>
      {active && (
        <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-e-full" />
      )}
      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{icon}</span>
      {label}
      {badge > 0 && <span className="ms-auto bg-error text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{badge}</span>}
    </Link>
  );
}
