import { Link, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useSaved } from "../hooks/useSaved";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import Logo from "./Logo";
import Icon from "./Icon";

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

// NAV-07: /about and /contact are real routes now (see Footer.tsx's COMPANY_LINKS
// comment) — only /#reviews stays a hash link, since reviews are inline content
// on the home page rather than a page of their own; RootLayout's hash-scroll
// effect is what actually makes that jump work now.
const DRAWER_MORE: { to: string; key: StringKey; icon: string }[] = [
  { to: "/#reviews", key: "nav_reviews", icon: "reviews" },
  { to: "/about", key: "nav_about", icon: "info" },
  { to: "/contact", key: "nav_contact", icon: "mail" },
];

interface Props {
  onOpenSearch: () => void;
}

export default function TopNav({ onOpenSearch }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const { count: savedCount } = useSaved();
  const { locale, setLocale } = useLocale();
  // PERF-03: both navs (only one visible at a time via md: breakpoint classes,
  // but both mounted) get their scroll-tint from --nav-progress, written
  // straight to the DOM on every scroll frame — never through React state, so
  // scrolling never re-renders this backdrop-blurred, full-width fixed nav.
  const desktopNavRef = useRef<HTMLElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 60);
        const p = isHome ? Math.min(y / 80, 1) : 1;
        desktopNavRef.current?.style.setProperty("--nav-progress", String(p));
        mobileNavRef.current?.style.setProperty("--nav-progress", String(p));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Scroll lock, inert-outside, focus-in and Escape are all handled by
  // useDialogA11y (see drawerRef/trapDrawerTab below) — no separate effect needed.

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

  const linkBase = "text-label font-semibold transition-colors duration-base px-4 py-2 rounded-lg";
  // Current page must be perceivable without colour (A11Y-10, WCAG 1.4.1) —
  // the background tint alone isn't enough, so the active link also gets a
  // real underline. React Router already sets aria-current="page" on the
  // active NavLink; nothing extra to add for that part.
  const linkActive = (isActive: boolean) =>
    isActive
      ? solidBg
        ? `${linkBase} text-primary bg-primary/8 underline decoration-2 underline-offset-4`
        : `${linkBase} text-white bg-white/15 underline decoration-2 underline-offset-4`
      : solidBg
        ? `${linkBase} text-on-surface-variant hover:text-primary hover:bg-primary/6`
        : `${linkBase} text-white/80 hover:text-white hover:bg-white/10`;

  return (
    <>
      {/* ── Desktop nav ─────────────────────────────────────────────────────── */}
      <nav
        ref={desktopNavRef}
        className={`nav-glass fixed top-0 left-0 w-full z-50 hidden md:flex items-center px-8 lg:px-12 ${solidBg ? "nav-glass--solid" : ""}`}
        style={{ height: "76px" }}
      >
        {/* Left column — nav links */}
        <div className="flex flex-1 items-center gap-1">
          {NAV_LINKS.map((l) => (
            <NavLink key={l.key} to={l.to} className={({ isActive }) => linkActive(isActive)}>
              {t(locale, l.key)}
            </NavLink>
          ))}
        </div>

        {/* Center column — logo, perfectly centered */}
        <div className="flex items-center justify-center flex-shrink-0">
          <Link to="/" aria-label={t(locale, "nav_home_aria")} className="flex items-center">
            <Logo
              className="object-contain"
              style={{ height: "52px", width: "auto" }}
              width={78}
              height={52}
            />
          </Link>
        </div>

        {/* Right column — action icons */}
        <div className="flex flex-1 items-center justify-end gap-1">
          {/* SO-03: the "/" shortcut existed but was undiscoverable — a hover
              title is the standard place to surface a keyboard shortcut. */}
          <button
            onClick={onOpenSearch}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-base
              ${solidBg ? "text-on-surface-variant hover:text-primary hover:bg-primary/8" : "text-white/80 hover:text-white hover:bg-white/12"}`}
            aria-label={t(locale, "nav_search_aria")}
            title={t(locale, "nav_search_shortcut_hint")}
          >
            <Icon name="search" className="text-title" />
          </button>

          <Link
            to="/saved"
            className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-base
              ${solidBg ? "text-on-surface-variant hover:text-error hover:bg-error/8" : "text-white/80 hover:text-white hover:bg-white/12"}`}
            title={t(locale, "nav_saved")}
            aria-label={t(locale, "nav_saved")}
          >
            <Icon name="favorite" className="text-title" style={{ fontVariationSettings: pathname === "/saved" ? "'FILL' 1" : "'FILL' 0" }} />
            {savedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-error text-white text-caption font-black rounded-full flex items-center justify-center">
                {savedCount}
              </span>
            )}
          </Link>

          <Link
            to="/requests"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-label font-semibold transition-colors duration-base
              ${solidBg ? "text-on-surface-variant hover:text-primary hover:bg-primary/8" : "text-white/80 hover:text-white hover:bg-white/12"}`}
          >
            <Icon name="receipt_long" className="text-subhead" />
            {t(locale, "nav_requests")}
          </Link>

          <button
            onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center text-caption font-bold transition-colors duration-base px-2.5 py-1.5 rounded-lg border
              ${solidBg
                ? "border-outline-variant/40 text-outline hover:text-primary hover:border-primary/50 hover:bg-primary/5"
                : "border-white/30 text-white/70 hover:text-white hover:border-white/60"}`}
            aria-label={t(locale, "nav_switch_language")}
          >
            {/* RTL-11: this label names the OTHER language, so it's always
                written in that language's own script — a screen reader on an
                Arabic page would otherwise try to pronounce "English" using
                Arabic phonetics. */}
            <span lang={locale === "en" ? "ar" : "en"}>{t(locale, "lang_switch")}</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ──────────────────────────────────────────────────── */}
      <nav
        ref={mobileNavRef}
        className={`nav-glass fixed top-0 left-0 w-full z-50 flex items-center justify-between px-4 md:hidden ${solidBg ? "nav-glass--solid" : ""}`}
        style={{ height: "64px" }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label={t(locale, "nav_open_menu")}
          className={`p-2 -ms-1 rounded-lg transition-colors touch-press
            ${solidBg ? "text-on-surface hover:bg-surface-container-low" : "text-white"}`}
        >
          <Icon name="menu" className="text-headline" />
        </button>

        {/* Logo — absolutely centered so it stays centered regardless of side widths */}
        <Link
          to="/"
          className="absolute left-1/2 -translate-x-1/2 flex items-center"
          aria-label={t(locale, "nav_home_aria")}
        >
          <Logo
            className="object-contain"
            style={{ height: "44px", width: "auto" }}
            width={66}
            height={44}
          />
        </Link>

        {/* Right: search + saved */}
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSearch}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-base touch-press
              ${solidBg ? "text-on-surface-variant hover:text-primary hover:bg-primary/8" : "text-white/80 hover:text-white hover:bg-white/12"}`}
            aria-label={t(locale, "nav_search_aria")}
          >
            <Icon name="search" className="text-title" />
          </button>
          <Link
            to="/saved"
            aria-label={t(locale, "nav_saved")}
            className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-base
              ${solidBg ? "text-on-surface-variant hover:text-error hover:bg-error/8" : "text-white/80 hover:text-white hover:bg-white/12"}`}
          >
            <Icon name="favorite" className="text-title" style={{ fontVariationSettings: pathname === "/saved" ? "'FILL' 1" : "'FILL' 0" }} />
            {savedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-error text-white text-caption font-black rounded-full flex items-center justify-center">
                {savedCount}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* ── Mobile drawer ───────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t(locale, "nav_menu")}>
          <div
            className="absolute inset-0 bg-on-background/45 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            onKeyDown={trapDrawerTab}
            className="drawer-left absolute top-0 left-0 rtl:left-auto rtl:right-0 h-full w-72 max-w-[84vw] bg-white shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15">
              <Link to="/" onClick={() => setDrawerOpen(false)} className="flex items-center">
                <Logo
                  className="object-contain"
                  style={{ height: "40px", width: "auto" }}
                  width={60}
                  height={40}
                />
              </Link>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-surface-container-low transition-colors"
                aria-label={t(locale, "nav_close_menu")}
              >
                <Icon name="close" className="text-outline" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-grow overflow-y-auto px-3 py-4 space-y-1">
              {DRAWER_MAIN.map((l) => (
                <DrawerLink
                  key={l.to}
                  to={l.to}
                  label={t(locale, l.key)}
                  icon={l.icon}
                  end={l.end}
                  pathname={pathname}
                  onClick={() => setDrawerOpen(false)}
                />
              ))}

              <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline px-3 pt-4 pb-1">
                {t(locale, "nav_my_activity")}
              </p>
              {DRAWER_PERSONAL.map((l) => (
                <DrawerLink
                  key={l.to}
                  to={l.to}
                  label={t(locale, l.key)}
                  icon={l.icon}
                  pathname={pathname}
                  onClick={() => setDrawerOpen(false)}
                  badge={l.to === "/saved" ? savedCount : 0}
                />
              ))}

              <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline px-3 pt-4 pb-1">
                {t(locale, "nav_more")}
              </p>
              {DRAWER_MORE.map((l) => (
                <DrawerLink
                  key={l.to}
                  to={l.to}
                  label={t(locale, l.key)}
                  icon={l.icon}
                  pathname={pathname}
                  onClick={() => setDrawerOpen(false)}
                />
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant/15 space-y-2">
              <Link
                to="/services"
                onClick={() => setDrawerOpen(false)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary font-bold text-label py-3 rounded-xl touch-press btn-press"
              >
                <Icon name="search" className="text-subhead" />
                {t(locale, "nav_browse_services")}
              </Link>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setLocale(locale === "en" ? "ar" : "en")}
                  className="text-caption font-bold text-outline py-1.5 px-2.5 rounded-lg border border-outline-variant/40 hover:text-primary hover:border-primary/40 transition-colors"
                  aria-label={t(locale, "nav_switch_language")}
                >
                  <span lang={locale === "en" ? "ar" : "en"}>{t(locale, "lang_switch")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DrawerLink({
  to, label, icon, end, pathname, onClick, badge = 0,
}: {
  to: string; label: string; icon: string; end?: boolean;
  pathname: string; onClick: () => void; badge?: number;
}) {
  const active = end ? pathname === to : (to.startsWith("/#") ? false : pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-label font-bold transition-colors relative ${
        active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
      }`}
    >
      {active && (
        <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-e-full" />
      )}
      <span
        className="material-symbols-outlined text-title"
        style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true" translate="no"
      >
        {icon}
      </span>
      {label}
      {badge > 0 && (
        <span className="ms-auto bg-error text-white text-caption font-black px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}
