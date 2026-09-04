import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

const SIZE = 148;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export interface DonutSlice {
  /** Stable key the caller uses to route a drill-down. */
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Status breakdown as a donut, drawn with plain react-native-svg — same
 * reasoning as SeriesChart/LeadsChart: this is the only place in the app that
 * needs one, and a charting dependency would cost more than the ~60 lines of
 * arc maths it saves.
 *
 * ── Why the segments are selectable ────────────────────────────────────────
 * A donut slice invites a tap, so it answers one. Selecting a slice fills the
 * centre with that status's own count and share and reveals the caller's
 * drill-down action; tapping it again clears the selection. Nothing here is
 * decorative: a slice that could not be acted on would still be readable, but
 * it would be lying about being interactive.
 *
 * Stroke arcs rather than wedge paths: a stroked circle with `strokeDasharray`
 * needs no path arithmetic and no large-arc edge case at >180°, which is
 * exactly where hand-rolled wedge maths usually breaks.
 */
export default function DonutChart({
  slices,
  centerLabel,
  onSelect,
  actionLabel,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  /** Called with the selected slice when the caller's action is tapped. */
  onSelect?: (slice: DonutSlice) => void;
  actionLabel?: (slice: DonutSlice) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = slices.find((s) => s.key === selected) ?? null;

  // Running offset so each arc starts where the previous one ended.
  let offset = 0;
  const arcs = slices.map((s) => {
    const fraction = total ? s.value / total : 0;
    const arc = { slice: s, dash: C * fraction, offset: C * offset };
    offset += fraction;
    return arc;
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.chartRow}>
        <View style={styles.donut}>
          <Svg width={SIZE} height={SIZE}>
            {/* -90° so the first slice starts at 12 o'clock rather than 3. */}
            <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
              {arcs.map(({ slice, dash, offset: o }) => (
                <Circle
                  key={slice.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={selected === slice.key ? STROKE + 4 : STROKE}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-o}
                  opacity={selected && selected !== slice.key ? 0.35 : 1}
                />
              ))}
            </G>
          </Svg>
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.centerValue}>{active ? active.value : total}</Text>
            <Text style={styles.centerLabel}>{active ? active.label : centerLabel}</Text>
            {active && total ? (
              <Text style={styles.centerShare}>{Math.round((active.value / total) * 100)}%</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.legend}>
          {slices.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setSelected(selected === s.key ? null : s.key)}
              style={({ pressed }) => [styles.legendRow, pressed && styles.legendRowPressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === s.key }}
              accessibilityLabel={`${s.label}: ${s.value}`}
            >
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={[styles.legendLabel, selected === s.key && styles.legendLabelActive]}>
                {s.label}
              </Text>
              <Text style={styles.legendValue}>{s.value}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {active && onSelect ? (
        <Pressable
          onPress={() => onSelect(active)}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>
            {actionLabel ? actionLabel(active) : active.label}
          </Text>
          <Text style={styles.actionChevron}>‹</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chartRow: { flexDirection: "row-reverse", alignItems: "center", gap: 16 },
  donut: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  centerValue: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
  centerLabel: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  centerShare: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.primary,
  },
  legend: { flex: 1, gap: 2 },
  legendRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  legendRowPressed: { backgroundColor: colors.surfaceContainerHigh },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: {
    flex: 1,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  legendLabelActive: { color: colors.onSurface, fontFamily: "Cairo_700Bold" },
  legendValue: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
  action: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionPressed: { backgroundColor: colors.surfaceContainerHigh },
  actionText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.primary,
    textAlign: textStart,
  },
  actionChevron: { fontSize: type.subhead.fontSize, color: colors.primary },
});
