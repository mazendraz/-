import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import { probeReady } from "@alassema/mobile-shared";

/**
 * Full-screen "can't reach the server" notice — rendered in place of the
 * whole app while @alassema/mobile-shared's useBackendHealth() reports the
 * backend unreachable. See app/_layout.tsx's gate order (maintenance wins
 * over offline: it's deliberate and has real copy).
 */
export default function OfflineScreen() {
  const [checking, setChecking] = useState(false);
  const [justFailed, setJustFailed] = useState(false);

  async function onRetry() {
    setChecking(true);
    setJustFailed(false);
    try {
      const ok = await probeReady();
      // A true recovery is picked up by useBackendHealth's own next
      // scheduled probe within ~10s regardless — this only gives the button
      // immediate feedback either way.
      if (!ok) setJustFailed(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brand}>العاصمة</Text>
        <Text style={styles.title}>مقدرش نوصل للسيرفر</Text>
        <Text style={styles.message}>
          فيه مشكلة في الاتصال بالسيرفر دلوقتي. اتأكد إنك متصل بالنت، وإن
          الموبايل والسيرفر على نفس الشبكة لو بتجرّب من جهاز التطوير.
        </Text>

        {justFailed && <Text style={styles.stillDown}>لسه مقدرش نوصله.</Text>}

        <Pressable style={styles.retryBtn} onPress={onRetry} disabled={checking}>
          <Text style={styles.retryText}>{checking ? "بنحاول..." : "حاول تاني"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 10 },
  brand: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_800ExtraBold",
    color: colors.onSurface,
    textAlign: "center",
  },
  message: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
  stillDown: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: type.caption.fontSize,
    color: colors.error,
    marginTop: 4,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 16,
  },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
