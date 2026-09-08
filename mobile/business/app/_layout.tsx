import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@alassema/core";
import {
  ensureRTL,
  useAppFonts,
  currentAppVersion,
  fetchAppVersion,
  isVersionBelow,
  useBackendHealth,
  usePushNotifications,
  initErrorReporting,
  reportError,
  setReportingRole,
} from "@alassema/mobile-shared";
import { bootstrapSession, useStaffAuth } from "../lib/staffAuth";
import Icon from "../components/Icon";
import IntroVideo from "../components/IntroVideo";
import OfflineScreen from "../components/OfflineScreen";
import UpdateRequiredScreen from "../components/UpdateRequiredScreen";
import CrashScreen from "../components/CrashScreen";

// expo-router's own top-level crash net: exporting `ErrorBoundary` from the
// root layout catches anything thrown by the route tree below it
// (https://docs.expo.dev/router/error-handling/#error-boundaries) — mirrors
// mobile/client's identical export. Sentry reporting lives HERE, not inside
// CrashScreen itself — see that component's own header comment on why it
// stays dependency-free.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  reportError(error);
  return <CrashScreen error={error} retry={retry} />;
}

// RTL must be forced before the FIRST screen mounts — see
// @alassema/mobile-shared's rtl.ts for why this can't be deferred to a
// component effect.
ensureRTL();

// No-ops until EXPO_PUBLIC_SENTRY_DSN is set (see .env.example) — see
// @alassema/mobile-shared's errorReporting.ts for the scrubbing rule.
initErrorReporting({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  app: "business",
  appVersion: currentAppVersion(),
});

// Held until fonts are loaded and the stored session is resolved, so the
// very first frame is already correct — no flash of system-font text, no
// flash of the wrong screen for someone who's actually signed in.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden — fine, this only happens on Fast Refresh */
});

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const router = useRouter();
  // The logo reveal that covers the app while it boots — see
  // components/IntroVideo.tsx. Starts already DONE on web: that build has no
  // splash/video handoff to cover, and holding a 3.5s animation in front of
  // it would slow every load down for no one's benefit.
  const [introDone, setIntroDone] = useState(Platform.OS === "web");
  const [sessionReady, setSessionReady] = useState(false);
  const { user, loading: authLoading } = useStaffAuth();

  useEffect(() => {
    setReportingRole(user?.role ?? null);
  }, [user?.role]);

  // Registers for push once signed in (no-ops until then — see its own
  // useAuthSubject() check) and wires notification-tap routing through
  // config's mapNotificationUrl. Called unconditionally, ahead of every
  // early return below, same as every other hook in this component — React
  // hooks must run in the same order on every render regardless of which
  // gate is currently active.
  usePushNotifications();

  // ── Backend reachability ───────────────────────────────────────────────
  const backendOffline = useBackendHealth();

  // ── Forced-update gate ──────────────────────────────────────────────────
  // api's /app-version, checked with ?app=business once B5 (phase 4) lands —
  // see docs/architecture/business-app/phase-4-realtime-push.md. Best-effort
  // and non-blocking: it must never be the reason the splash screen hangs if
  // this one request is slow.
  //
  // No maintenance gate here — deliberately. api's maintenance.ts middleware
  // exempts every /provider/* and /admin/* route by design ("those
  // dashboards stay usable during maintenance — that is the point"), so
  // blocking staff out would lock out the one person who can turn
  // maintenance back off. See phase-2's own note on this.
  const [updateRequired, setUpdateRequired] = useState<{
    iosUrl: string | null;
    androidUrl: string | null;
    message: string | null;
  } | null>(null);

  useEffect(() => {
    fetchAppVersion()
      .then((v) => {
        if (isVersionBelow(currentAppVersion(), v.minimum)) {
          setUpdateRequired({ iosUrl: v.iosUrl, androidUrl: v.androidUrl, message: v.message });
        }
      })
      .catch(() => {
        // Unconfigured API, or the check itself failed — never block the
        // app over a failure to learn whether it's blocked.
      });
  }, []);

  useEffect(() => {
    bootstrapSession().finally(() => setSessionReady(true));
  }, []);

  // The splash has to outlast every condition below that decides what to
  // render — hiding it earlier just swaps the splash for a blank white
  // frame, which reads as a crash rather than as loading.
  useEffect(() => {
    if (fontsLoaded && sessionReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, sessionReady]);

  // A FLAG rather than an early `return null`. The intro overlay has to keep
  // its place in the tree across the moment boot finishes: returning early
  // would unmount it and restart the video from frame zero — see
  // IntroVideo.tsx's header.
  const booting = !fontsLoaded || !sessionReady || authLoading;

  // Auth routing (sign-in vs. each role's tab group, and the redirect
  // between them) is handled by expo-router itself — see app/index.tsx and
  // each route group's own _layout.tsx guard — not by branching here. The
  // Stack ALWAYS mounts once the loading gates above clear: swapping in a
  // manually-rendered screen component instead of letting the Stack own
  // navigation would break deep-linking and the back button for no benefit,
  // since <Redirect> already does this correctly.
  const content = booting ? null : updateRequired ? (
    <UpdateRequiredScreen status={updateRequired} />
  ) : backendOffline ? (
    <OfflineScreen />
  ) : (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
        // The native-stack header's own back button does not respond to
        // taps under this app's forced-RTL layout (I18nManager.forceRTL +
        // swapLeftAndRightInRTL(false) — see @alassema/mobile-shared's
        // rtl.ts). mobile/client sidesteps it by drawing every header
        // itself; here the ~50 screens that DO use the native header get a
        // custom headerLeft instead — a plain Pressable that calls
        // router.back(), which works regardless of layout direction. This
        // also drops the route-group name ("(admin)") that the default back
        // button was showing as its label.
        headerBackVisible: false,
        headerLeft: ({ canGoBack }) =>
          canGoBack ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              style={styles.headerBack}
            >
              <Icon name="arrow_forward" size={24} color={colors.onSurface} />
            </Pressable>
          ) : null,
      }}
    />
  );

  return (
    <>
      {/* Mounted only once boot is done — the same "nothing on screen until
          every hold clears" contract the early return used to provide, now
          expressed as a condition so the intro overlay below can outlive the
          transition. */}
      {!booting && (
        <SafeAreaProvider>
          {Platform.OS === "web" ? (
            <View style={styles.webBackdrop}>
              <View style={styles.webFrame}>{content}</View>
            </View>
          ) : (
            content
          )}
          <StatusBar style="dark" />
        </SafeAreaProvider>
      )}
      {/* LAST child, so it paints over everything above it — including the
          forced-update / offline screens, which are allowed to resolve
          underneath the animation rather than racing it. */}
      {!introDone && <IntroVideo onDone={() => setIntroDone(true)} />}
    </>
  );
}

const styles = StyleSheet.create({
  headerBack: { paddingHorizontal: 4, paddingVertical: 4 },
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
