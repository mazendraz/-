import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import Logo from "./Logo";
import Icon from "./Icon";
import { probeReady } from "@alassema/mobile-shared";

/**
 * Full-screen "can't reach the server" notice — the mobile counterpart of
 * the website's StatusScreen (offline variant). Rendered in place of the
 * whole Stack while useBackendHealth() reports the backend unreachable, same
 * as MaintenanceScreen is for maintenance mode — see app/_layout.tsx for the
 * priority between the two ("maintenance wins: it's deliberate and has real
 * copy", same as the website).
 *
 * Before this existed, an unreachable API just left every screen showing
 * empty lists with zero explanation — indistinguishable from "the app is
 * broken" to anyone testing it on a phone off the dev machine's network.
 */
export default function OfflineScreen() {
  const [checking, setChecking] = useState(false);
  const [justFailed, setJustFailed] = useState(false);

  async function onRetry() {
    setChecking(true);
    setJustFailed(false);
    try {
      const ok = await probeReady();
      // No need to do anything on success — the same probe result flows back
      // through useBackendHealth's own onReachabilityChange listener isn't
      // wired here, so give immediate feedback either way; a true recovery is
      // picked up by the hook's own next scheduled probe within ~10s regardless.
      if (!ok) setJustFailed(true);
    } finally {
      // In `finally`, not after the await. probeReady() is written not to throw,
      // but "the button un-disables itself" must not depend on that staying
      // true — this is the retry control on the screen a user reaches when
      // everything else has already failed, and leaving it stuck disabled is the
      // one outcome it can't afford.
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Logo size={64} />

        <View style={styles.iconCircle}>
          <Icon name="link_off" size={40} color={colors.primary} />
        </View>

        <Text style={styles.title}>مقدرش نوصل للسيرفر</Text>
        <Text style={styles.message}>
          فيه مشكلة في الاتصال بالسيرفر دلوقتي. اتأكد إنك متصل بالنت، وإن
          الموبايل والسيرفر على نفس الشبكة لو بتجرّب من جهاز التطوير.
        </Text>

        {justFailed && <Text style={styles.stillDown}>لسه مقدرش نوصله.</Text>}

        <Pressable style={styles.retryBtn} onPress={onRetry} disabled={checking}>
          <Icon name="refresh" size={18} color={colors.onPrimary} />
          <Text style={styles.retryText}>{checking ? "بنحاول..." : "حاول تاني"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceContainer, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 10 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_800ExtraBold",
    color: colors.onSurface,
    textAlign: "center",
    marginTop: 8,
  },
  message: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
  stillDown: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.error, marginTop: 4 },
  retryBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 16,
  },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
