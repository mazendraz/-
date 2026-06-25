import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import TopNav from "./components/TopNav";
import Footer from "./components/Footer";
import ScrollProgress from "./components/ScrollProgress";
import SearchOverlay from "./components/SearchOverlay";
import BottomNav from "./components/BottomNav";
import { LocaleProvider } from "./context/LocaleContext";

export default function RootLayout() {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

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
