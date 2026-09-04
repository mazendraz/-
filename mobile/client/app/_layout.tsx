import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { ApiLead } from "@alassema/core";
import { colors } from "@alassema/core";
import {
  ensureRTL,
  useAppFonts,
  useLiveEvents,
  currentAppVersion,
  dismissUpdateNudge,
  fetchAppVersion,
  isUpdateNudgeDismissed,
  isVersionBelow,
  useMaintenance,
  useBackendHealth,
  initErrorReporting,
  reportError,
  setReportingRole,
} from "@alassema/mobile-shared";
import { bootstrapSession, useCustomerAuth } from "../lib/customerAuth";
import { refreshFromServer } from "../lib/saved";
import { fetchAccountLeads } from "../lib/customerLeads";
import PriceVerificationGate from "../components/PriceVerificationGate";
import MaintenanceScreen from "../components/MaintenanceScreen";
import OfflineScreen from "../components/OfflineScreen";
import UpdateRequiredScreen from "../components/UpdateRequiredScreen";
import SoftUpdateBanner from "../components/SoftUpdateBanner";
import GuestPromptModal from "../components/GuestPromptModal";
import AppShell from "../components/AppShell";
import AppMenu from "../components/AppMenu";
import CrashScreen from "../components/CrashScreen";
import IntroVideo from "../components/IntroVideo";

// expo-router's own top-level crash net: exporting `ErrorBoundary` from the
// root layout catches anything thrown by the route tree below it
// (https://docs.expo.dev/router/error-handling/#error-boundaries) — the
// mobile counterpart of the website's <ErrorBoundary> class mounted above
// <RouterProvider> in main.tsx. Before this existed, an unhandled render
// error anywhere in the app meant a permanent blank/white screen with no way
// back short of force-quitting. Sentry reporting lives HERE, not inside
// CrashScreen itself — see that component's own header comment on why it
// stays dependency-free.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  reportError(error);
  return <CrashScreen error={error} retry={retry} />;
}

// RTL must be forced before the FIRST screen mounts — see lib/rtl.ts for why
// this can't be deferred to a component effect.
ensureRTL();

// No-ops until EXPO_PUBLIC_SENTRY_DSN is set (see .env.example) — see
// @alassema/mobile-shared's errorReporting.ts for the scrubbing rule.
initErrorReporting({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  app: "client",
  appVersion: currentAppVersion(),
});

// Held until fonts are loaded and the stored session is resolved, so the very
// first frame the user sees is already correct — no flash of system-font text,
// no flash of the signed-out shell for someone who's actually signed in.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden — fine, this only happens on Fast Refresh */
});

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  // The logo reveal that covers the app while it boots — see
  // components/IntroVideo.tsx. Starts already DONE on web: that build is the
  // render-verification surface (see lib/session.ts), and holding a 3.5s
  // animation in front of it would slow every check down for no one's benefit.
  const [introDone, setIntroDone] = useState(Platform.OS === "web");
  const [sessionReady, setSessionReady] = useState(false);
  const { customer } = useCustomerAuth();

  useEffect(() => {
    setReportingRole(customer ? "customer" : "guest");
  }, [customer]);

  // ── Maintenance mode (phase 10) ───────────────────────────────────────────
  // Checked FIRST, ahead of the price-verification gate below — same
  // priority order the website's RootLayout uses ("Maintenance wins over
  // offline: it is deliberate and has real copy and an ETA"). Unlike the
  // website, there's no admin bypass here: this app has no admin session to
  // let through, only customers.
  const { status: maintenance, loading: maintenanceLoading, refetch: recheckMaintenance } = useMaintenance();

  // ── Backend reachability (mirrors OfflineScreen.tsx / @alassema/mobile-shared's useBackendHealth) ──
  // Checked right alongside maintenance — same priority as the website's
  // RootLayout: maintenance wins over offline since it's deliberate and has
  // real copy/an ETA, "offline" is just "we can't reach the server at all".
  const backendOffline = useBackendHealth();

  // ── Forced-update gate ────────────────────────────────────────────────────
  // api's /app-version is the one lever the server has over a build already
  // installed on someone's phone — the endpoint existed with no caller
  // anywhere in this app until now. Checked ahead of even maintenance: a
  // build below `minimum` (broken contract or a security fix) must stop
  // regardless of whether the site itself is otherwise up. Best-effort and
  // non-blocking on purpose — it must never be the reason the splash screen
  // hangs if this one request is slow; it simply swaps the content once (and
  // if) it resolves as required.
  const [updateRequired, setUpdateRequired] = useState<{ iosUrl: string | null; androidUrl: string | null; message: string | null } | null>(null);

  // The non-blocking sibling of updateRequired — see components/SoftUpdateBanner.tsx
  // for why `latest` gets a dismissible banner instead of the full-screen gate
  // `minimum` triggers above.
  const [softUpdate, setSoftUpdate] = useState<{ latest: string; iosUrl: string | null; androidUrl: string | null; message: string | null } | null>(null);

  useEffect(() => {
    fetchAppVersion()
      .then(async (v) => {
        if (isVersionBelow(currentAppVersion(), v.minimum)) {
          setUpdateRequired({ iosUrl: v.iosUrl, androidUrl: v.androidUrl, message: v.message });
          return;
        }
        if (isVersionBelow(currentAppVersion(), v.latest) && !(await isUpdateNudgeDismissed(v.latest))) {
          setSoftUpdate({ latest: v.latest, iosUrl: v.iosUrl, androidUrl: v.androidUrl, message: v.message });
        }
      })
      .catch(() => {
        // Unconfigured API, or the check itself failed — never block the app
        // over a failure to learn whether it's blocked.
      });
  }, []);

  useEffect(() => {
    bootstrapSession().finally(() => setSessionReady(true));
  }, []);

  // Has the FIRST check for a signed-in customer settled yet? The website
  // blocks rendering on the same question (RootLayout's `leadsHydrated`) so
  // that "there is no frame where a stale local cache gets to decide that for
  // us". Without it the app painted the full Stack immediately and only swapped
  // in the gate once the request came back — a window in which the customer
  // could already be tapping through screens the gate is supposed to be
  // covering. Released immediately for a SIGNED-OUT visitor: guest browsing has
  // no account leads to check, so there is nothing to wait for.
  const [verificationChecked, setVerificationChecked] = useState(false);

  // The splash has to outlast EVERY condition that makes render() return null
  // below, `verificationChecked` included — hiding it earlier just swaps the
  // splash for a blank white frame until the last hold clears, which reads as
  // a crash rather than as loading.
  useEffect(() => {
    if (fontsLoaded && sessionReady && !maintenanceLoading && verificationChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, sessionReady, maintenanceLoading, verificationChecked]);

  // ── Mandatory final-price verification gate (Phase 9) ────────────────────
  // A signed-in customer with a PENDING completion on any of their own leads
  // must resolve it before doing anything else — mirrors the website's
  // RootLayout.tsx, which renders PriceVerificationGate in place of the
  // entire public site for the same reason. `gatedLeadId` LATCHES onto the
  // lead once found, exactly like the website's own field of the same name:
  // re-deriving "should the gate show" from live data on every render would
  // yank the gate away the instant the customer confirms/disputes (the
  // refetch below already reflects the resolved verificationStatus), before
  // PriceVerificationGate's own rating step ever gets a chance to render.
  // The gate only releases when the component itself calls onResolved.
  const [gatedLead, setGatedLead] = useState<ApiLead | null>(null);
  const gatedLeadId = useRef<string | null>(null);
  const checkPendingVerification = useCallback(async () => {
    if (gatedLeadId.current) return; // already latched — a refetch here would race the resolve
    try {
      const leads = await fetchAccountLeads();
      const pending = leads.find((l) => l.completion?.verificationStatus === "PENDING");
      if (pending) {
        gatedLeadId.current = pending.id;
        setGatedLead(pending);
      }
    } catch {
      // Best-effort — a failed check here must not block the whole app; the
      // next live event or app open tries again.
    } finally {
      // In `finally`, not the try: a failed check must release the hold too,
      // or an unreachable API would leave the app stuck on a blank frame
      // forever — the exact hang the request timeout in lib/api.ts exists to
      // prevent elsewhere.
      setVerificationChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionReady || maintenance.enabled) return;
    // Nothing to check for a guest — release the hold immediately rather than
    // making every signed-out visitor wait on a request that can't apply.
    if (!customer) {
      setVerificationChecked(true);
      return;
    }
    void checkPendingVerification();
  }, [sessionReady, customer, maintenance.enabled, checkPendingVerification]);

  // Catches a completion that happens WHILE the app is already open, not just
  // at cold start — same "no screen the customer can dodge it on" guarantee
  // the website gets from RootLayout re-rendering on every route.
  useLiveEvents((event) => {
    if (!customer || maintenance.enabled) return;
    void checkPendingVerification();
    // Favorites are account data now (see lib/saved.ts). This is the one
    // subscription in the app that is always mounted, so it is where the
    // shortlist gets told to re-read itself — favouriting on the web, or on
    // the customer's other phone, lands here and the heart flips without a
    // refresh. Scoped server-side to this customer's own channel.
    // `reconnect` is the client-synthesised "you may have missed something"
    // signal (see liveEvents.ts) — reconcile everything this handler owns,
    // not just the one thing a real event would have named.
    if (event.type === "favorite" || event.type === "reconnect") void refreshFromServer();
  });

  function onGateResolved() {
    gatedLeadId.current = null;
    setGatedLead(null);
  }

  // `verificationChecked` joins the same hold as fonts/session/maintenance —
  // see its declaration for why the gate must not be raced by a first paint.
  // Deliberately NOT gated on maintenance/offline/update: each of those
  // replaces the whole app anyway, and none of them should wait on an account
  // request that may be exactly what's failing.
  //
  // A FLAG rather than the two `return null`s this used to be. The intro
  // overlay has to keep its place in the tree across the moment boot finishes:
  // returning early would unmount it and restart the video from frame zero
  // exactly when the session resolved (see IntroVideo.tsx's header). Rendering
  // nothing is still precisely what happens while this is true — it just
  // happens one level further in, BESIDE the overlay rather than instead of it.
  const booting =
    !fontsLoaded ||
    !sessionReady ||
    maintenanceLoading ||
    (!maintenance.enabled && !backendOffline && !updateRequired && !verificationChecked);

  const content = booting ? null : updateRequired ? (
    <UpdateRequiredScreen status={updateRequired} />
  ) : maintenance.enabled ? (
    <MaintenanceScreen status={maintenance} onRetry={recheckMaintenance} />
  ) : backendOffline ? (
    <OfflineScreen />
  ) : gatedLead ? (
    <PriceVerificationGate lead={gatedLead} onResolved={onGateResolved} />
  ) : (
    // AppShell is the persistent chrome — see its own header comment. It wraps
    // the WHOLE navigator rather than living inside it, which is what makes
    // the bottom bar survive a push into an internal screen. It is
    // deliberately only on this branch: maintenance / offline / forced-update
    // / the price-verification gate each replace the entire app above, and
    // none of them has anything for a tab bar to navigate within.
    <>
      <AppShell>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface },
            // ── Swipe-back ──────────────────────────────────────────────
            // Every screen in this app draws its own header, so `headerShown`
            // is false everywhere — and on iOS that ALSO silently kills the
            // system back gesture, because UIKit's
            // interactivePopGestureRecognizer is wired to the navigation bar
            // it is being told to hide. The app was left with no way back
            // except finding the one small arrow in the corner, which is
            // exactly the "I get into things easily but can't get out, and
            // swiping back does nothing" report.
            //
            // `gestureEnabled` alone does not bring it back for a hidden
            // header. `fullScreenGestureEnabled` does: react-native-screens
            // installs its own pan recogniser across the whole screen instead
            // of relying on UIKit's edge one, so the swipe works from
            // anywhere and from the correct (right-hand, under RTL) edge.
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
      </AppShell>
      {/* Only reachable here — never during maintenance/offline/forced-update/
          the price-verification gate, each of which already replaces the
          whole app above and has nothing this could float over. */}
      {softUpdate && (
        <SoftUpdateBanner
          message={softUpdate.message}
          iosUrl={softUpdate.iosUrl}
          androidUrl={softUpdate.androidUrl}
          onDismiss={() => {
            void dismissUpdateNudge(softUpdate.latest);
            setSoftUpdate(null);
          }}
        />
      )}
    </>
  );

  return (
    <>
      {/* Mounted only once boot is done — the same "nothing on screen until
          every hold clears" contract the two early returns above used to
          provide, now expressed as a condition so the intro overlay below can
          outlive the transition. */}
      {!booting && (
        <SafeAreaProvider>
          {/* On web this is a phone app rendered in an arbitrary-width desktop
              browser tab, not a real phone — with no cap, every screen (the hero
              image included) stretches to the full window width, which is what
              was actually making the hero crop look wrong/off-center and every
              list/card feel stretched and "un-mobile" compared to the real
              website. Pin it to a phone-sized column on web only; native builds
              (iOS/Android) are untouched since Platform.OS !== "web" there. */}
          {Platform.OS === "web" ? (
            <View style={styles.webBackdrop}>
              <View style={styles.webFrame}>{content}</View>
            </View>
          ) : (
            content
          )}
          <GuestPromptModal />
          {/* The one <MenuModal> in the app. Every hamburger anywhere in the
              shell just flips lib/appMenu.ts's store; nothing else mounts a menu
              of its own, so there is exactly one instance and opening it from a
              screen five pushes deep changes no navigation state at all. */}
          <AppMenu />
          <StatusBar style="dark" />
        </SafeAreaProvider>
      )}
      {/* LAST child, so it paints over everything above it — including the
          maintenance / offline / forced-update screens, which are allowed to
          resolve underneath the animation rather than racing it. */}
      {!introDone && <IntroVideo onDone={() => setIntroDone(true)} />}
    </>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
  },
  webFrame: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
  },
});
