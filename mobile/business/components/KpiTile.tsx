import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * One KPI number with an optional trend delta. Shared between the provider
 * overview (phase 3) and the admin overview (phase 8) — same tile, different
 * data source (`ApiLeadStats.byCompany`/`.catalog` are empty/absent on the
 * provider endpoint and populated on the admin one, so this component never
 * assumes either is present).
 *
 * ── Tappable when, and only when, there is somewhere to go ─────────────────
 * A KPI is a question ("28 new — which ones?"), so where an answer exists the
 * tile navigates to it. `onPress` is optional precisely so the tile can also
 * render inert: a number with no meaningful destination must NOT look
 * pressable, or the UI is promising something it cannot deliver. The press
 * affordances below (chevron, ripple, role) all key off the same prop, so the
 * two states can never drift apart.
 */
export default function KpiTile({
  label,
  value,
  deltaPercent,
  onPress,
  accessibilityHint,
}: {
  label: string;
  value: string | number;
  /** Where this number can be investigated. Omit for a display-only tile. */
  onPress?: () => void;
  /** Spoken after the label — say where the tap goes, e.g. "يفتح الطلبات الجديدة". */
  accessibilityHint?: string;
  /** null = "no comparable previous window" (server sends null, not 0/∞ —
   *  see ApiLeadStats.recent's own comment). Renders "جديد" instead of a
   *  percentage in that case. */
  deltaPercent?: number | null;
}) {
  const body = (
    <>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {onPress ? <Text style={styles.chevron}>‹</Text> : null}
      </View>
      <Text style={styles.value}>{value}</Text>
      {deltaPercent !== undefined ? (
        <Text style={[styles.delta, deltaTone(deltaPercent)]}>{deltaText(deltaPercent)}</Text>
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.tile}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="button"
      // The visible label is the metric NAME ("جديد"); on its own that tells a
      // screen-reader user nothing about the number or the destination, so both
      // are spoken explicitly here.
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
    >
      {body}
    </Pressable>
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
  tilePressed: { backgroundColor: colors.surfaceContainerHigh, opacity: 0.9 },
  labelRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  chevron: { fontSize: type.body.fontSize, color: colors.outline },
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
