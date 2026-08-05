import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import { Suspense, useEffect, useRef, useState } from "react";
import TopNav from "./components/TopNav";
import Logo from "./components/Logo";
import SkipLink from "./components/SkipLink";
import Footer from "./components/Footer";
import ScrollProgress from "./components/ScrollProgress";
import SearchOverlay from "./components/SearchOverlay";
import BottomNav from "./components/BottomNav";
import { LocaleProvider, useLocale } from "./context/LocaleContext";
import { ToastProvider } from "./context/ToastContext";
import StatusScreen from "./components/StatusScreen";
import { useMaintenance } from "./lib/settings";
import { useBackendHealth } from "./hooks/useBackendHealth";
import { useHashScroll } from "./hooks/useHashScroll";
import { useSaved } from "./hooks/useSaved";
import { getCurrentUser } from "./lib/auth";
import { hasFullBleedHero } from "./lib/heroRoutes";
import { t } from "./lib/i18n";

export default function RootLayout() {
  const { pathname } = useLocation();
  // Home and company-profile pages render their own full-bleed hero/cover
  // that starts flush under the (transparent, floating) nav — every other
  // page needs real clearance from the fixed nav instead. Gating the padding
  // here, once, off the same predicate TopNav uses for its transparency,
  // replaces the old pattern of adding the padding on <main> and cancelling
  // it back out with a matching negative margin on the hero itself (two
  // numbers in two files that had to stay byte-for-byte identical to avoid a
  // gap or an overlap).
  const hasHero = hasFullBleedHero(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useHashScroll();
  const { status: maintenance, loading: maintenanceLoading } = useMaintenance();
  const backendOffline = useBackendHealth();

  const openSearch = () => setSearchOpen(true);

  // Warm the most-visited route chunks during browser idle time, so the first
  // navigation to them is instant (no loading spinner) without bloating the
  // initial landing-page download. PERF-06: skipped entirely on Save-Data or a
  // slow connection — a visitor who opted out of (or can't afford) extra bytes
  // shouldn't pay for 4 chunks they may never open.
  useEffect(() => {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (conn?.saveData || (conn?.effectiveType && ["slow-2g", "2g"].includes(conn.effectiveType))) {
      return;
    }

    const prefetch = () => {
      import("./pages/Services");
      import("./pages/Companies");
      import("./pages/CompanyProfile");
      import("./pages/GuidedStart");
    };
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    });
    if (ric.requestIdleCallback) {
      const id = ric.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => ric.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetch, 1500);
    return () => window.clearTimeout(id);
  }, []);

  // PERF-07: `key={pathname}` used to force a full remount of everything
  // inside <main> on every navigation, just to replay the page-enter CSS
  // animation — which meant every in-flight request, every piece of local
  // state, and every effect in the outgoing AND incoming page was torn down
  // and re-run on every route change. Removing + re-adding the class instead
  // (forcing a reflow in between, so the browser doesn't treat it as a no-op)
  // replays the same @keyframes animation without touching the subtree.
  const isFirstRender = useRef(true);
  useEffect(() => {
    // The class is present from the very first paint, so the browser already
    // plays the entrance animation on initial mount without any help — only
    // a LATER pathname change needs the replay.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const el = mainRef.current;
    if (!el) return;
    el.classList.remove("page-enter");
    void el.offsetWidth;
    el.classList.add("page-enter");
  }, [pathname]);

  // Gate the PUBLIC shell only. /admin and /provider are separate routes in
  // main.tsx and never mount RootLayout, so both dashboards keep working while
  // the public site is down — which is the whole point of taking it down.
  //
  // An ADMIN browsing the public site is let through so they can verify the real
  // pages before flipping maintenance back off.
  const isAdmin = getCurrentUser()?.role === "ADMIN";
  const showMaintenance = maintenance.enabled && !isAdmin;

  if (showMaintenance || backendOffline) {
    // Maintenance wins over offline: it is deliberate and has real copy and an
    // ETA, so it is strictly more informative than "we can't reach the server".
    return (
      <LocaleProvider>
        <StatusScreen
          variant={showMaintenance ? "maintenance" : "offline"}
          status={maintenance}
        />
      </LocaleProvider>
    );
  }

  // Wait for the first /status read to settle before deciding what to render.
  // Without this the real site paints for a beat and is then yanked away —
  // which looks like a bug and briefly exposes pages that are supposed to be
  // down. ST-01: this used to be a blank white div — on a slow connection
  // that reads as a broken page, not a loading one.
  if (maintenanceLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Logo className="h-11 w-11 object-contain" width={44} height={44} />
        <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <LocaleProvider>
    <ToastProvider>
    <div className="min-h-screen flex flex-col bg-background text-on-background">
      <SkipLink />
      <ScrollRestoration />
      <ScrollProgress />
      <TopNav onOpenSearch={openSearch} />

      <main
        ref={mainRef}
        id="main"
        className={`flex-grow page-enter pb-14 md:pb-0 ${hasHero ? "" : "pt-[calc(var(--nav-h)+2rem)]"}`}
      >
        <Suspense fallback={<RouteFallback />}>
          <Outlet context={{ openSearch }} />
        </Suspense>
      </main>

      <Footer />
      <PublicBottomNav />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </ToastProvider>
    </LocaleProvider>
  );
}

/**
 * Builds the public site's 4 tabs (DM-07's BottomNav generalization). Its own
 * component, not inline in RootLayout: RootLayout renders `<LocaleProvider>`
 * itself, so a `useLocale()` call in RootLayout's own body would read the
 * context DEFAULT rather than the provider's value — the same bug class
 * main.tsx's dashboard routes hit before they got the fix (see the comment
 * there). A child component is a real descendant of the provider and reads
 * correctly.
 */
function PublicBottomNav() {
  const { locale } = useLocale();
  const { count } = useSaved();
  return (
    <BottomNav
      ariaLabel={t(locale, "nav_more")}
      items={[
        { to: "/", label: t(locale, "nav_home"), icon: "home", end: true },
        { to: "/services", label: t(locale, "nav_services"), icon: "grid_view" },
        { to: "/saved", label: t(locale, "nav_saved"), icon: "favorite", badge: count },
        { to: "/requests", label: t(locale, "nav_requests"), icon: "receipt_long" },
      ]}
    />
  );
}

/** Minimal fallback while a lazily-loaded route chunk is fetched. Keeps the
 *  viewport height so the footer doesn't jump up during the brief load. */
function RouteFallback() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}
