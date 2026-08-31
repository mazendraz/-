import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * One KPI number with an optional trend delta. Shared between the provider
 * overview (phase 3) and the admin overview (phase 8) — same tile, different
 * data source (`ApiLeadStats.byCompany`/`.catalog` are empty/absent on the
 * provider endpoint and populated on the admin one, so this component never
 * assumes either is present).
 */
export default function KpiTile({
  label,
  value,
  deltaPercent,
}: {
  label: string;
  value: string | number;
  /** null = "no comparable previous window" (server sends null, not 0/∞ —
   *  see ApiLeadStats.recent's own comment). Renders "جديد" instead of a
   *  percentage in that case. */
  deltaPercent?: number | null;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {deltaPercent !== undefined ? (
        <Text style={[styles.delta, deltaTone(deltaPercent)]}>{deltaText(deltaPercent)}</Text>
      ) : null}
    </View>
  );
}

function deltaText(delta: number | null): string {
  if (delta === null) return "جديد";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${Math.round(delta)}%`;
}

function deltaTone(delta: number | null) {
  if (delta === null || delta === 0) return { color: colors.onSurfaceVariant };
  return delta > 0 ? { color: colors.success } : { color: colors.error };
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  label: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  value: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
  delta: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
  },
});
