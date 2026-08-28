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
import PriceVerificationGate from "./components/priceVerification/PriceVerificationGate";
import { useMaintenance } from "./lib/settings";
import { useBackendHealth } from "./hooks/useBackendHealth";
import { useHashScroll } from "./hooks/useHashScroll";
import { useSaved } from "./hooks/useSaved";
import { getCurrentUser } from "./lib/auth";
import { useMyLeads, useMyLeadsHydrated } from "./lib/requests";
import { useAccountLeads } from "./hooks/useAccountLeads";
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

  // ── Mandatory final-price verification gate ──────────────────────────────
  // A client (no account — see lib/requests.ts) with a PENDING completion on
  // any of their own leads must resolve it before doing anything else on the
  // site: every route under RootLayout hits this same check, so there's no
  // URL to type or link to click that skips it (see PriceVerificationGate).
  //
  // `gatedLeadId` LATCHES onto the lead once found, rather than re-deriving
  // "should the gate be showing" from live data on every render: the moment
  // the client confirms/disputes, myLeads already reflects the resolved
  // verificationStatus (verifyLeadAmount writes it straight to localStorage),
  // which would otherwise yank the gate away mid-flow, before the confirmation
  // panel and the optional review step ever get a chance to render. The gate
  // only releases when PriceVerificationGate itself calls onResolved (review
  // submitted or explicitly skipped).
  // Pulls the signed-in account's requests (and waiting-list joins) into the
  // same local cache useMyLeads() reads. Mounted HERE rather than on My
  // Requests so that signing in on a new browser fills in the whole shell —
  // the messages list, the unread badge and the verification gate below all
  // read that cache and used to see nothing until My Requests happened to be
  // opened. No-op for a signed-out visitor.
  const { settled: accountSettled } = useAccountLeads();
  const myLeads = useMyLeads();
  // Closes a real refresh-bypass window: without this, the FIRST render after a
  // hard refresh paints from whatever this device cached before the provider
  // ever completed the service (no completion field yet), so livePendingLead
  // reads as undefined and the normal site flashes for the one network
  // round-trip refreshMyLeadsFromApi() takes to come back. "The block must
  // persist after refresh" means the server gets asked BEFORE we decide,
  // not that we decide first and correct ourselves after — see useMyLeadsHydrated.
  const leadsHydrated = useMyLeadsHydrated();

  // ── Structural backstop for the three first-paint gates ───────────────────
  // Each `return <BootSpinner/>` below waits on a promise, and a promise that
  // never settles never runs its `.finally()` — so before lib/api.ts grew a
  // request deadline, any one of these three could hold the ENTIRE public site
  // on a spinner indefinitely (a captive portal, a black-holed route: the
  // socket connects and nothing ever comes back). No error, no retry, and a
  // reload did the same thing.
  //
  // The request timeout is the real fix and this is not a substitute for it —
  // note the 20s here is LONGER than api.ts's 15s deliberately. The ordering
  // matters: the request layer must always be the thing that gives up first, so
  // a failure still travels through the normal catch/finally paths and the
  // offline screen still gets its signal. This only ever fires if some FUTURE
  // unbounded await slips back in, and its whole job is to make that a slow
  // page rather than a dead site.
  const maintenanceReady = useReleasedAfter(!maintenanceLoading);
  const leadsReady = useReleasedAfter(leadsHydrated);
  const accountReady = useReleasedAfter(accountSettled);

  const [gatedLeadId, setGatedLeadId] = useState<string | null>(null);
  const livePendingLead = myLeads.find((l) => l.completion?.verificationStatus === "PENDING");
  useEffect(() => {
    if (livePendingLead && !gatedLeadId) setGatedLeadId(livePendingLead.id);
  }, [livePendingLead, gatedLeadId]);
  const gatedLead = gatedLeadId ? myLeads.find((l) => l.id === gatedLeadId) : undefined;

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
  if (!maintenanceReady) return <BootSpinner />;

  // Same reasoning as maintenanceLoading above, for the same reason: render
  // nothing routable until we've actually asked the server whether this device
  // has a pending price verification, so there is no frame where a stale local
  // cache gets to decide that for us.
  //
  // BOTH sources, because a customer's requests can come from either: this
  // device's own submissions (leadsHydrated) and the signed-in account
  // (accountSettled). Waiting on only the first would let an account-owned
  // pending verification slip through on any browser that didn't happen to
  // submit the request itself. accountSettled resolves immediately for a
  // signed-out visitor, so nobody waits for a check that doesn't apply.
  if (!leadsReady || !accountReady) return <BootSpinner />;

  // No <TopNav>/<BottomNav> in this branch — that is what makes the block
  // structural rather than a dismissible modal. It replaces the entire public
  // shell for every pathname (this component renders regardless of `pathname`),
  // survives a hard refresh (recomputed from localStorage + the existing
  // /leads/track hydration on every mount), and never touches /admin or
  // /provider (separate route trees in main.tsx that never mount RootLayout).
  if (gatedLead) {
    return (
      <LocaleProvider>
        <ToastProvider>
          <PriceVerificationGate lead={gatedLead} onResolved={() => setGatedLeadId(null)} />
        </ToastProvider>
      </LocaleProvider>
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

/**
 * The full-screen hold shown before the shell can decide what to render.
 *
 * ST-01: this used to be a blank white div — on a slow connection that reads as
 * a broken page, not a loading one. Extracted rather than duplicated so the two
 * gates that use it can never drift apart.
 */
function BootSpinner() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <Logo className="h-11 w-11 object-contain" width={44} height={44} />
      <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

/** See the block comment at the `maintenanceReady` declaration for why this exists. */
const GATE_BACKSTOP_MS = 20_000;

/**
 * `ready`, but forced true once GATE_BACKSTOP_MS has passed without it becoming
 * true on its own.
 *
 * Latching (rather than tracking `ready` continuously) is the point: once the
 * backstop has fired we stay released, so a gate can never re-close and trap the
 * user a second time. Nothing here re-arms it, and nothing should — a gate that
 * needs to hold the shell again after first paint is a different mechanism, not
 * this one.
 */
function useReleasedAfter(ready: boolean): boolean {
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (ready || released) return;
    const id = window.setTimeout(() => {
      console.warn(
        `[al-assema] A first-paint gate did not settle within ${GATE_BACKSTOP_MS}ms — ` +
          "releasing it so the site is usable. This should not happen: lib/api.ts times " +
          "requests out well before this. Check for an await that bypasses apiFetch.",
      );
      setReleased(true);
    }, GATE_BACKSTOP_MS);
    return () => window.clearTimeout(id);
  }, [ready, released]);

  return ready || released;
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
