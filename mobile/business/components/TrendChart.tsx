import { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { colors, type } from "@alassema/core";

const HEIGHT = 120;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;

export interface TrendPoint {
  /** "YYYY-MM-DD" or "YYYY-MM" — passed back on selection for drill-down. */
  date: string;
  label: string;
  value: number;
}

/**
 * Leads over time, with selectable points.
 *
 * ── Why this exists next to SeriesChart ────────────────────────────────────
 * SeriesChart is a sparkline for the Control Centre's read-only overview: two
 * lines, no interaction, deliberately small. This one is the analytics screen's
 * primary chart — single series, but every point is addressable, because "12
 * leads on the 3rd" is the question a provider actually opens analytics to ask.
 * Merging the two would have meant one component with a mode flag doing both
 * jobs badly.
 *
 * ── Why taps are handled on an overlay, not on the SVG ─────────────────────
 * `react-native-svg` hit-testing on a `viewBox`-scaled element is unreliable
 * across platforms, and a 2px-radius circle is far below the ~44px touch
 * target a finger needs anyway. So the line is drawn in a scaled SVG, and a row
 * of full-height transparent Pressables sits on top — each one a real touch
 * target regardless of how dense the series is.
 */
export default function TrendChart({
  points,
  color = colors.primary,
  onSelect,
  actionLabel,
  valueSuffix = "",
}: {
  points: TrendPoint[];
  color?: string;
  onSelect?: (point: TrendPoint) => void;
  actionLabel?: string;
  valueSuffix?: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  const n = points.length;
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = 0; // counts — a non-zero floor would exaggerate small changes
  const range = max - min || 1;

  const y = (v: number) => HEIGHT - ((v - min) / range) * (HEIGHT - PAD_TOP - PAD_BOTTOM) - PAD_BOTTOM;
  const xPct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);

  const polyline = points.map((p, i) => `${xPct(i)},${y(p.value)}`).join(" ");
  const active = selected !== null ? points[selected] : null;

  // At most 5 x-labels, always including the last — a dense axis is unreadable
  // on a phone long before the data becomes unreadable.
  const labelStep = Math.max(1, Math.ceil(n / 5));

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryValue}>
          {active ? active.value : values.reduce((a, b) => a + b, 0)}
          {valueSuffix}
        </Text>
        <Text style={styles.summaryLabel}>{active ? active.label : "الإجمالي في الفترة"}</Text>
      </View>

      <View style={styles.plot} onLayout={onLayout}>
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none">
          {active ? (
            <Line
              x1={xPct(selected!)}
              y1={0}
              x2={xPct(selected!)}
              y2={HEIGHT}
              stroke={colors.outlineVariant}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {n > 1 ? (
            <Polyline
              points={polyline}
              fill="none"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {active ? (
            <Circle cx={xPct(selected!)} cy={y(active.value)} r={3} fill={color} />
          ) : (
            n > 0 && <Circle cx={xPct(n - 1)} cy={y(values[n - 1])} r={2.5} fill={color} />
          )}
        </Svg>

        {/* Transparent touch targets — see the header comment. */}
        {width > 0 && n > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {points.map((p, i) => (
              <Pressable
                key={p.date}
                onPress={() => setSelected(selected === i ? null : i)}
                style={[styles.hit, { left: (i / n) * width, width: width / n }]}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}: ${p.value}`}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.xAxis}>
        {points.map((p, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <Text key={p.date} style={styles.xLabel}>
              {p.label}
            </Text>
          ) : null,
        )}
      </View>

      {active && onSelect ? (
        <Pressable
          onPress={() => onSelect(active)}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{actionLabel ?? "عرض التفاصيل"}</Text>
          <Text style={styles.actionChevron}>‹</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  summaryRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: 8 },
  summaryValue: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
  summaryLabel: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  plot: { height: HEIGHT },
  hit: { position: "absolute", top: 0, bottom: 0 },
  xAxis: { flexDirection: "row-reverse", justifyContent: "space-between" },
  xLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: colors.outline },
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
  },
  actionChevron: { fontSize: type.subhead.fontSize, color: colors.primary },
});
