import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export interface FunnelStep {
  /** Stable key for the caller's drill-down; not shown. */
  key?: string;
  label: string;
  value: number;
}

/**
 * Cumulative conversion funnel.
 *
 * The stage counts come from `@alassema/core`'s `statsFunnel` — the same
 * definition the website's provider dashboard uses, so the two surfaces can
 * never disagree about what "conversion" means. This component only draws.
 *
 * ── Interaction ────────────────────────────────────────────────────────────
 * A row is pressable only when the caller supplies `onSelect`. Each stage maps
 * to a real lead status, so the drill-down is a genuine filtered list rather
 * than a tooltip for its own sake. Percentages are shown against the FIRST
 * stage (everything received), which is what makes a funnel readable — a stage
 * measured against its immediate predecessor answers a different, less useful
 * question.
 */
export default function FunnelBar({
  steps,
  onSelect,
}: {
  steps: FunnelStep[];
  onSelect?: (step: FunnelStep) => void;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const top = steps[0]?.value ?? 0;

  return (
    <View style={styles.wrap}>
      {steps.map((s) => {
        const widthPercent = Math.max(4, (s.value / max) * 100);
        const share = top ? Math.round((s.value / top) * 100) : 0;

        const body = (
          <>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{s.label}</Text>
              <View style={styles.valueGroup}>
                {top > 0 ? <Text style={styles.share}>{share}%</Text> : null}
                <Text style={styles.value}>{s.value}</Text>
              </View>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPercent}%` }]} />
            </View>
          </>
        );

        if (!onSelect) return <View key={s.label} style={styles.row}>{body}</View>;

        return (
          <Pressable
            key={s.label}
            onPress={() => onSelect(s)}
            style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${s.value}`}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 4 },
  rowPressable: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4, marginHorizontal: -6 },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  labelRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  valueGroup: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  label: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  share: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.outline,
    fontVariant: ["tabular-nums"],
  },
  value: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainer, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
});
