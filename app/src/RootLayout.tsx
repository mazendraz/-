import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import TopNav from "./components/TopNav";
import Footer from "./components/Footer";
import ScrollProgress from "./components/ScrollProgress";
import SearchOverlay from "./components/SearchOverlay";
import BottomNav from "./components/BottomNav";
import { LocaleProvider } from "./context/LocaleContext";
import StatusScreen from "./components/StatusScreen";
import { useMaintenance } from "./lib/settings";
import { useBackendHealth } from "./hooks/useBackendHealth";
import { getCurrentUser } from "./lib/auth";

export default function RootLayout() {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const { status: maintenance, loading: maintenanceLoading } = useMaintenance();
  const backendOffline = useBackendHealth();

  const openSearch = () => setSearchOpen(true);

  // Warm the most-visited route chunks during browser idle time, so the first
  // navigation to them is instant (no loading spinner) without bloating the
  // initial landing-page download.
  useEffect(() => {
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

  // Render nothing until the first /status read settles. Without this the real
  // site paints for a beat and is then yanked away — which looks like a bug and
  // briefly exposes pages that are supposed to be down.
  if (maintenanceLoading) return <div className="min-h-screen bg-background" />;

  return (
    <LocaleProvider>
    <div className="min-h-screen flex flex-col bg-background text-on-background">
      <ScrollRestoration />
      <ScrollProgress />
      <TopNav onOpenSearch={openSearch} />

      {/* key forces remount on route change → page-enter animation fires */}
      <main key={pathname} className="flex-grow page-enter pb-14 md:pb-0">
        <Suspense fallback={<RouteFallback />}>
          <Outlet context={{ openSearch }} />
        </Suspense>
      </main>

      <Footer />
      <BottomNav />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </LocaleProvider>
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
