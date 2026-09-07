import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import { clamp01, useReveal } from "./chartMotion";

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
 *
 * A pressable row now says so before it is pressed: it carries a chevron and
 * a pressed fill. Previously the only difference between a row that opened a
 * filtered list and one that did nothing was what happened after you touched
 * it, which is not an affordance — it is a guess that happens to pay off.
 *
 * ── Motion ─────────────────────────────────────────────────────────────────
 * The bars fill from empty, staggered top to bottom so the funnel reads in the
 * order it means — each stage a subset of the one above it — and the counts
 * and percentages count up with their own bar rather than sitting at their
 * final value while it grows. No hook per row: one shared 0→1 ramp
 * (`useReveal`, which also honours reduced motion) is sliced per index, which
 * is what keeps this correct for any number of stages.
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

  const dataKey = steps.map((s) => `${s.key ?? s.label}:${s.value}`).join("|");
  const reveal = useReveal(dataKey, 700);
  // Half the timeline is spent handing the start of the animation down the
  // rows; the other half is how long any single bar takes to fill. With one
  // row the stagger collapses to zero and it simply fills over the whole ramp.
  const stagger = steps.length > 1 ? 0.5 / (steps.length - 1) : 0;
  const span = Math.max(0.001, 1 - stagger * (steps.length - 1));

  return (
    <View style={styles.wrap}>
      {steps.map((s, i) => {
        const grow = clamp01((reveal - i * stagger) / span);
        const widthPercent = Math.max(4, (s.value / max) * 100) * grow;
        const share = top ? Math.round((s.value / top) * 100) : 0;

        const body = (
          <>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{s.label}</Text>
              <View style={styles.valueGroup}>
                {top > 0 ? <Text style={styles.share}>{Math.round(share * grow)}%</Text> : null}
                <Text style={styles.value}>{Math.round(s.value * grow)}</Text>
                {onSelect ? <Text style={styles.chevron}>‹</Text> : null}
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
  /** Only rendered on a pressable row — it is the affordance, so it must not
   *  appear on a row that leads nowhere. */
  chevron: {
    fontSize: type.subhead.fontSize,
    lineHeight: type.subhead.fontSize + 2,
    includeFontPadding: false,
    color: colors.outline,
  },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainer, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
});
