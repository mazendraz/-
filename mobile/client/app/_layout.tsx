import { useCallback, useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { ApiLead } from "@alassema/core";
import { colors } from "@alassema/core";
import { ensureRTL } from "../lib/rtl";
import { useAppFonts } from "../lib/fonts";
import { bootstrapSession, useCustomerAuth } from "../lib/customerAuth";
import { fetchAccountLeads } from "../lib/customerLeads";
import { useLiveEvents } from "../lib/liveEvents";
import { useMaintenance } from "../lib/settings";
import PriceVerificationGate from "../components/PriceVerificationGate";
import MaintenanceScreen from "../components/MaintenanceScreen";

// RTL must be forced before the FIRST screen mounts — see lib/rtl.ts for why
// this can't be deferred to a component effect.
ensureRTL();

// Held until fonts are loaded and the stored session is resolved, so the very
// first frame the user sees is already correct — no flash of system-font text,
// no flash of the signed-out shell for someone who's actually signed in.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden — fine, this only happens on Fast Refresh */
});

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const [sessionReady, setSessionReady] = useState(false);
  const { customer } = useCustomerAuth();

  // ── Maintenance mode (phase 10) ───────────────────────────────────────────
  // Checked FIRST, ahead of the price-verification gate below — same
  // priority order the website's RootLayout uses ("Maintenance wins over
  // offline: it is deliberate and has real copy and an ETA"). Unlike the
  // website, there's no admin bypass here: this app has no admin session to
  // let through, only customers.
  const { status: maintenance, loading: maintenanceLoading, refetch: recheckMaintenance } = useMaintenance();

  useEffect(() => {
    bootstrapSession().finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && sessionReady && !maintenanceLoading) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, sessionReady, maintenanceLoading]);

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
    }
  }, []);

  useEffect(() => {
    if (sessionReady && customer && !maintenance.enabled) void checkPendingVerification();
  }, [sessionReady, customer, maintenance.enabled, checkPendingVerification]);

  // Catches a completion that happens WHILE the app is already open, not just
  // at cold start — same "no screen the customer can dodge it on" guarantee
  // the website gets from RootLayout re-rendering on every route.
  useLiveEvents(() => {
    if (customer && !maintenance.enabled) void checkPendingVerification();
  });

  function onGateResolved() {
    gatedLeadId.current = null;
    setGatedLead(null);
  }

  if (!fontsLoaded || !sessionReady || maintenanceLoading) return null;

  return (
    <SafeAreaProvider>
      {maintenance.enabled ? (
        <MaintenanceScreen status={maintenance} onRetry={recheckMaintenance} />
      ) : gatedLead ? (
        <PriceVerificationGate lead={gatedLead} onResolved={onGateResolved} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
      )}
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
