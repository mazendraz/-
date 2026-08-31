import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";

/**
 * Stub content for a route that exists (so its tab renders and the screen
 * is reachable) but whose real screen is built in a later phase. Every one
 * of these is replaced, not built on top of — see the phase number in each
 * call site for which phase file owns it.
 */
export default function PlaceholderScreen({ title, phase }: { title: string; phase: string }) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{phase}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
  },
  note: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
  },
});
