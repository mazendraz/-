import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import Logo from "./Logo";
import Icon from "./Icon";

/**
 * Blocking "you must update" screen — same rendered-instead-of-the-whole-app
 * pattern as MaintenanceScreen/OfflineScreen, but for the one condition none
 * of those cover: THIS BUILD is below api's `/app-version` `minimum`. Unlike
 * maintenance/offline there is no retry that fixes it — the only exit is the
 * store link, so there is deliberately no dismiss/back action here.
 */
export default function UpdateRequiredScreen({
  status,
}: {
  status: { iosUrl: string | null; androidUrl: string | null; message: string | null };
}) {
  const storeUrl = Platform.OS === "ios" ? status.iosUrl : status.androidUrl;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Logo size={64} />

        <View style={styles.iconCircle}>
          <Icon name="system_update" size={40} color={colors.primary} />
        </View>

        <Text style={styles.title}>فيه تحديث لازم تنزّله</Text>
        <Text style={styles.message}>
          {status.message?.trim() ||
            "النسخة اللي عندك من التطبيق قديمة ومش شغّالة دلوقتي. حدّث التطبيق عشان تقدر تكمل."}
        </Text>

        {storeUrl ? (
          <Pressable style={styles.updateBtn} onPress={() => Linking.openURL(storeUrl)}>
            <Icon name="system_update" size={18} color={colors.onPrimary} />
            <Text style={styles.updateText}>حدّث دلوقتي</Text>
          </Pressable>
        ) : null}
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
  updateBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 16,
  },
  updateText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
