import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export default function FunnelBar({
  steps,
}: {
  steps: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <View style={styles.wrap}>
      {steps.map((s) => {
        const widthPercent = Math.max(4, (s.value / max) * 100);
        return (
          <View key={s.label} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{s.label}</Text>
              <Text style={styles.value}>{s.value}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPercent}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 4 },
  labelRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, textAlign: textStart },
  value: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainer, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
});
