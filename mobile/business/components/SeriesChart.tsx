import { Fragment, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, type } from "@alassema/core";
import { rowStart, uiIsRTL } from "@alassema/mobile-shared";
import { clamp01, coordsUpTo, toPath, useReveal } from "./chartMotion";

const HEIGHT = 96;
const PAD_V = 6;
/** Room for the endpoint marker at both ends, so it is never half-drawn
 *  against the card edge. */
const PAD_EDGE = 5;
const MAX_LABELS = 5;

export interface SeriesLine {
  label: string;
  color: string;
  values: number[];
}

/**
 * A sparkline-grade line chart — "simple and legible on a phone... an
 * emphasized endpoint beats a dense desktop chart shrunk down" (phase-12's
 * own framing). Plain react-native-svg, no charting package — same reasoning
 * as LeadsChart and TrendChart: these are the only places in the app that need
 * one. Supports 1-2 series sharing one y-scale; x-axis labels are THINNED to
 * at most MAX_LABELS — the data itself is never capped
 * (ApiDesktopOverview.series's own doc comment: up to 365 points for a custom
 * window).
 *
 * ── Measured, not viewBox-scaled ───────────────────────────────────────────
 * Like its two siblings this drew into `viewBox="0 0 100 H"` with
 * `preserveAspectRatio="none"`, which stretches x by roughly 3.4× on a phone
 * and leaves y at 1×. The polyline survived that via
 * `vectorEffect="non-scaling-stroke"`; the emphasised endpoint `Circle` did
 * not, and rendered as a flat ellipse — on a chart whose entire design premise
 * is "an emphasized endpoint". Drawing in measured pixels is what makes the
 * marker actually round.
 *
 * Direction follows the UI: the oldest point sits on the start edge, which is
 * the right on this Arabic build, and the x labels are pinned to the same
 * coordinates the line uses rather than distributed by a flex row — so the
 * dates cannot end up running opposite to the data.
 *
 * ── Motion ─────────────────────────────────────────────────────────────────
 * The lines draw themselves in along their own arc length and the endpoint
 * marker lands last. That is the whole of it: this stays the non-interactive
 * sparkline it was described as above — the Control Centre's overview is
 * read-mostly by design (see phase-12), so nothing here answers a tap. The
 * entrance exists so a range change reads as the data being replaced instead
 * of the card silently swapping its picture. Reduced motion skips it.
 */
export default function SeriesChart({
  dates,
  lines,
  valueFormatter,
}: {
  dates: string[];
  lines: SeriesLine[];
  valueFormatter?: (v: number) => string;
}) {
  const [width, setWidth] = useState(0);

  const allValues = lines.flatMap((l) => l.values);
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;
  const n = dates.length;

  const plotLeft = PAD_EDGE;
  const plotRight = Math.max(PAD_EDGE, width - PAD_EDGE);
  const plotWidth = plotRight - plotLeft;

  const y = (v: number) => HEIGHT - PAD_V - ((v - min) / range) * (HEIGHT - PAD_V * 2);
  const x = (i: number) => {
    if (n <= 1) return plotLeft + plotWidth / 2;
    const t = i / (n - 1);
    return uiIsRTL ? plotRight - t * plotWidth : plotLeft + t * plotWidth;
  };

  // Keyed on the data so a range change replays the draw — one component
  // instance serves every range the caller switches between.
  const reveal = useReveal(
    `${n}:${dates[0] ?? ""}:${dates[n - 1] ?? ""}:${lines.map((l) => l.values.length).join(",")}:${max}`,
  );

  const path = (values: number[]) =>
    toPath(coordsUpTo(values.map((v, i) => ({ x: x(i), y: y(v) })), reveal));

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

      <View style={styles.plot} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {lines.map((l) => {
              const lastIndex = l.values.length - 1;
              const lastValue = l.values.at(-1) ?? 0;
              return (
                <Fragment key={l.label}>
                  {n > 1 ? (
                    <Path
                      d={path(l.values)}
                      fill="none"
                      stroke={l.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                  <Circle
                    cx={x(Math.max(0, lastIndex))}
                    cy={y(lastValue)}
                    // Rides in with the last third of the line rather than
                    // sitting at the end waiting for it to arrive.
                    r={3.5 * clamp01((reveal - 0.62) / 0.38)}
                    fill={l.color}
                    stroke={colors.surfaceContainerLowest}
                    strokeWidth={1.5}
                  />
                </Fragment>
              );
            })}
          </Svg>
        ) : null}
      </View>

      <View style={styles.xAxis}>
        {width > 0
          ? dates.map((d, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <Text key={`${d}-${i}`} style={[styles.xLabel, { left: x(i) - 24 }]} numberOfLines={1}>
                  {d.slice(5)}
                </Text>
              ) : null,
            )
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  legend: { flexDirection: rowStart, flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: rowStart, alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  plot: { height: HEIGHT },
  xAxis: { height: 14 },
  xLabel: {
    position: "absolute",
    top: 0,
    width: 48,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
  },
});
