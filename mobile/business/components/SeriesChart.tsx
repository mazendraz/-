import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { colors, type } from "@alassema/core";

const HEIGHT = 90;
const MAX_LABELS = 5;

export interface SeriesLine {
  label: string;
  color: string;
  values: number[];
}

/**
 * A sparkline-grade area/line chart — "simple and legible on a phone... an
 * emphasized endpoint beats a dense desktop chart shrunk down" (phase-12's
 * own framing). Plain react-native-svg, no charting package — same
 * reasoning as LeadsChart (phase 8): this is the only place in the app
 * that needs one. Supports 1-2 series sharing one y-scale; x-axis labels
 * are THINNED to at most MAX_LABELS — the data itself is never capped
 * (ApiDesktopOverview.series's own doc comment: up to 365 points for a
 * custom window).
 */
export default function SeriesChart({ dates, lines, valueFormatter }: { dates: string[]; lines: SeriesLine[]; valueFormatter?: (v: number) => string }) {
  const allValues = lines.flatMap((l) => l.values);
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;
  const n = dates.length;

  function points(values: number[]): string {
    if (n <= 1) return "";
    return values
      .map((v, i) => {
        const x = (i / (n - 1)) * 100;
        const y = HEIGHT - ((v - min) / range) * (HEIGHT - 8) - 4;
        return `${x},${y}`;
      })
      .join(" ");
  }

  const labelStep = Math.max(1, Math.ceil(n / MAX_LABELS));

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        {lines.map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={styles.legendLabel}>
              {l.label}: {valueFormatter ? valueFormatter(l.values.at(-1) ?? 0) : (l.values.at(-1) ?? 0)}
            </Text>
          </View>
        ))}
      </View>

      <Svg width="100%" height={HEIGHT} viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none">
        {lines.map((l) => {
          const pts = points(l.values);
          const lastX = n > 1 ? 100 : 0;
          const lastValue = l.values.at(-1) ?? 0;
          const lastY = HEIGHT - ((lastValue - min) / range) * (HEIGHT - 8) - 4;
          return (
            <Fragment key={l.label}>
              {pts ? <Polyline points={pts} fill="none" stroke={l.color} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
              <Circle cx={lastX} cy={lastY} r={2.5} fill={l.color} />
            </Fragment>
          );
        })}
      </Svg>

      <View style={styles.xAxis}>
        {dates.map((d, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <Text key={i} style={styles.xLabel}>{d.slice(5)}</Text>
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  legend: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  xAxis: { flexDirection: "row-reverse", justifyContent: "space-between" },
  xLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: colors.outline },
});
