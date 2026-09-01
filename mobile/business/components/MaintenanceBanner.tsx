import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

/** Shown at the top of the admin overview whenever maintenance is on —
 *  phase-11's own instruction: "Show the current state unambiguously". */
export default function MaintenanceBanner() {
  return (
    <Pressable style={styles.banner} onPress={() => router.push("/settings/maintenance")}>
      <Text style={styles.title}>الموقع في وضع الصيانة الآن</Text>
      <Text style={styles.subtitle}>العملاء بيشوفوا شاشة الصيانة بدل الموقع. اضغط للتحكم.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.error,
    borderRadius: 14,
    padding: 14,
    gap: 3,
  },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onError, textAlign: textStart },
  subtitle: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onError, textAlign: textStart },
});
