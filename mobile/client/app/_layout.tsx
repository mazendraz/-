import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@alassema/core";
import { ensureRTL } from "../lib/rtl";
import { useAppFonts } from "../lib/fonts";
import { bootstrapSession } from "../lib/customerAuth";

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

  useEffect(() => {
    bootstrapSession().finally(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && sessionReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, sessionReady]);

  if (!fontsLoaded || !sessionReady) return null;

  return (
    // Explicit, not assumed: expo-router's docs for this SDK don't confirm
    // whether one is provided automatically, and the cost of one here is zero
    // either way (a nested provider is a no-op) while its absence silently
    // breaks every `useSafeAreaInsets()` call in the app.
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
