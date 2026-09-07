import { useEffect, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { colors, type } from "@alassema/core";
import { rowStart, textStart, uiIsRTL } from "@alassema/mobile-shared";
import { clamp01, coordsUpTo, pulse, toPath, useEased, useReveal } from "./chartMotion";

const DEFAULT_HEIGHT = 148;
const PAD_TOP = 14;
const PAD_BOTTOM = 18;
/** Room on the axis side for the gridline value labels. */
const PAD_AXIS = 26;
/** Marker radius. >=8px diameter is the floor for a mark someone has to see. */
const DOT_R = 4.5;
/** Horizontal breathing room at both ends of the plot. The marker sits ON the
 *  first or last point, so without this the newest point's dot — the one the
 *  chart draws by default — is drawn half outside the canvas and renders as a
 *  half-moon against the card edge. Radius plus its surface ring. */
const PAD_EDGE = DOT_R + 2;
/** Fixed so the bubble can be centred on a point before it has measured
 *  itself; a bubble that jumps into place on its second frame is worse than
 *  one whose width does not track its text exactly. */
const TIP_W = 92;

export interface TrendPoint {
  /** "YYYY-MM-DD" or "YYYY-MM" — passed back on selection for drill-down. */
  date: string;
  label: string;
  value: number;
}

/**
 * Leads over time, with selectable points — the analytics screen's primary
 * chart.
 *
 * ── Why this exists next to SeriesChart ────────────────────────────────────
 * SeriesChart is a sparkline for the Control Centre's read-only overview: two
 * lines, no interaction, deliberately small. This one is single-series but
 * every point is addressable, because "12 leads on the 3rd" is the question a
 * provider actually opens analytics to ask.
 *
 * ── Why it is measured, not viewBox-scaled ─────────────────────────────────
 * This drew into `viewBox="0 0 100 H"` with `preserveAspectRatio="none"`,
 * which stretches x by ~3.4× on a phone and leaves y alone. Strokes escaped it
 * via `vectorEffect="non-scaling-stroke"`, but nothing else did: the endpoint
 * `Circle r={3}` rendered as a 20px-wide, 6px-tall ellipse — visible in a
 * screenshot as a dash where a dot belonged. Measuring the width and drawing
 * in real pixels is the fix, and it is also what makes the area fill, the
 * gridlines and the rounded joins below possible at all.
 *
 * ── What the chart gained ──────────────────────────────────────────────────
 * A bare zigzag with no scale can be looked at but not read — you could see
 * that something moved without learning how much. It now carries three
 * recessive gridlines with their values, a soft area fill that anchors the
 * line to its own zero baseline, and a single direct label on the selected
 * point. Everything added is grey or a tint; the series keeps the only strong
 * colour on the card.
 *
 * ── Scrubbing, not tapping ─────────────────────────────────────────────────
 * This used to lay a row of transparent `Pressable`s over the plot, one per
 * point. That answered a tap and nothing else: dragging a finger along the
 * line — the first thing anyone tries on a chart — did nothing at all, and on
 * a 90-day window each target was under 4px wide, so the tap it did answer
 * usually landed on the wrong day. One `PanResponder` over the whole plot
 * replaces them: the nearest point to the finger is selected on touch and
 * follows it while it moves, so precision stops mattering and the chart reads
 * as something you handle rather than something you poke.
 *
 * It deliberately does NOT claim the gesture on a vertical drag
 * (`onMoveShouldSetPanResponder` compares dx against dy) and it grants
 * termination on request, so the analytics screen underneath still scrolls
 * when the finger goes up or down — a chart that eats the page scroll is a
 * worse bug than one that cannot be scrubbed.
 *
 * ── Motion ─────────────────────────────────────────────────────────────────
 * The line draws itself in along its own arc length and the area grows under
 * the part that exists (see `coordsUpTo`), the headline figure rolls to its
 * new value rather than snapping, and the marker pulses once whenever the
 * selection moves. All of it is skipped when the OS asks for reduced motion —
 * see `chartMotion.ts`.
 */
export default function TrendChart({
  points,
  color = colors.primary,
  onSelect,
  actionLabel,
  valueSuffix = "",
  height = DEFAULT_HEIGHT,
  gridSteps = 2,
}: {
  points: TrendPoint[];
  color?: string;
  onSelect?: (point: TrendPoint) => void;
  actionLabel?: string;
  valueSuffix?: string;
  /** Taller when the chart is opened full-screen — see ExpandedChart. */
  height?: number;
  /** Gridlines between 0 and the ceiling. More room, more of the scale. */
  gridSteps?: number;
}) {
  const HEIGHT = height;
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  const n = points.length;
  const values = points.map((p) => p.value);
  const rawMax = Math.max(1, ...values);
  // A "nice" ceiling so the gridline labels are round numbers a person can
  // read, rather than whatever the tallest day happened to be.
  const max = niceCeiling(rawMax);

  // Identity of the DATA, not of the component. The analytics screen keeps one
  // TrendChart mounted across all four period chips, so a mount-only entrance
  // would play once on open and never again — switching 30 days to 90 would
  // swap the whole series in place with no transition at all.
  const dataKey = `${n}:${points[0]?.date ?? ""}:${points[n - 1]?.date ?? ""}:${max}`;
  const reveal = useReveal(dataKey);

  // A selection is an index into a series that no longer exists once the
  // period changes; keeping it would point the marker and the drill-down at
  // whatever day happens to sit at that offset in the new window.
  useEffect(() => {
    setSelected(null);
  }, [dataKey]);

  const active = selected !== null ? (points[selected] ?? null) : null;

  const plotLeft = (uiIsRTL ? 0 : PAD_AXIS) + PAD_EDGE;
  const plotRight = width - (uiIsRTL ? PAD_AXIS : 0) - PAD_EDGE;
  const plotWidth = Math.max(0, plotRight - plotLeft);
  const baseY = HEIGHT - PAD_BOTTOM;

  const y = (v: number) => HEIGHT - PAD_BOTTOM - (v / max) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  /** Index → x. Time runs from the UI's start edge to its end, so on this
   *  Arabic build the oldest point is on the right. */
  const x = (i: number) => {
    if (n <= 1) return plotLeft + plotWidth / 2;
    const t = i / (n - 1);
    return uiIsRTL ? plotRight - t * plotWidth : plotLeft + t * plotWidth;
  };

  const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const drawn = coordsUpTo(coords, reveal);
  const linePath = toPath(drawn);
  const areaPath =
    drawn.length > 1
      ? `${linePath} L ${drawn[drawn.length - 1].x} ${baseY} L ${drawn[0].x} ${baseY} Z`
      : "";

  // ── Selection feedback ─────────────────────────────────────────────────────
  // `tip` fades the crosshair and the bubble in together so the two never
  // disagree about whether a point is selected; `pop` is keyed on WHICH point,
  // so scrubbing across the series re-fires the marker's pulse on every day it
  // crosses rather than only on the first.
  const tip = useEased(selected === null ? 0 : 1, 170);
  const pop = useReveal(selected === null ? "none" : `p${selected}`, 300);
  const markerIn = clamp01((reveal - 0.55) / 0.45);
  const markerR = DOT_R * markerIn * (1 + 0.55 * pulse(pop));

  const summaryTarget = active ? active.value : values.reduce((a, b) => a + b, 0);
  const summaryShown = Math.round(useEased(summaryTarget, 380));

  /** Finger x → the index it is nearest to. The inverse of `x(i)`, and it has
   *  to invert the RTL flip too or a scrub runs backwards. */
  const indexAt = (px: number) => {
    if (n <= 1) return 0;
    const t = clamp01((px - plotLeft) / (plotWidth || 1));
    return Math.round((uiIsRTL ? 1 - t : t) * (n - 1));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Horizontal intent only — see the header note about page scroll.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (e) => {
          const i = indexAt(e.nativeEvent.locationX);
          setSelected((prev) => (prev === i ? null : i));
        },
        onPanResponderMove: (e) => {
          const i = indexAt(e.nativeEvent.locationX);
          setSelected((prev) => (prev === i ? prev : i));
        },
      }),
    // `indexAt` is a closure over exactly these three; rebuilding the
    // responder on every render would drop an in-flight gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, plotLeft, plotWidth],
  );

  // 0 … max in even intervals. The requested `gridSteps` is only a ceiling:
  // the actual count is the largest one that divides `max` WITHOUT a
  // remainder, because a scale that reads 0·3·5·8·10 (what 4 steps over a max
  // of 10 produces once each label is rounded) looks broken — the gaps are
  // visibly unequal while claiming to be a linear axis.
  const steps = [gridSteps, 5, 4, 3, 2].find((c) => c <= gridSteps && max % c === 0) ?? 2;
  const gridValues = Array.from({ length: steps + 1 }, (_, i) => (max * (steps - i)) / steps);

  // More labels fit on a taller chart, but never one per point.
  const labelStep = Math.max(1, Math.ceil(n / (height > 240 ? 8 : 5)));
  // Which points get a date under them. The last point is always labelled —
  // it is the one people look for — but only if it is far enough from the
  // previous label to not collide with it. Adding it unconditionally is what
  // printed "09-06" and "09-05" on top of each other at the edge.
  const labelled = new Set<number>();
  for (let i = 0; i < n; i += labelStep) labelled.add(i);
  if (n > 0) {
    const last = n - 1;
    const previous = Math.max(...[...labelled]);
    if (last - previous >= Math.max(2, labelStep / 2)) labelled.add(last);
    else {
      labelled.delete(previous);
      labelled.add(last);
    }
  }
  // The scrubbed point names itself under the plot even when the thinning
  // above did not pick it — that date IS the answer while a finger is down.
  // Any fixed label close enough to collide with it stands down for as long
  // as the selection lasts.
  const axisLabels = new Set(labelled);
  if (selected !== null) {
    const guard = Math.max(2, labelStep * 0.6);
    for (const i of labelled) if (Math.abs(i - selected) < guard) axisLabels.delete(i);
    axisLabels.add(selected);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryValue}>
          {summaryShown}
          {valueSuffix}
        </Text>
        <Text style={styles.summaryLabel}>{active ? active.label : "الإجمالي في الفترة"}</Text>
      </View>

      <View
        style={{ height: HEIGHT }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && n > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0.01} />
              </LinearGradient>
            </Defs>

            {/* Grid: recessive, and labelled so the line has a scale. */}
            {gridValues.map((v) => (
              <Line
                key={`g${v}`}
                x1={plotLeft - PAD_EDGE}
                y1={y(v)}
                x2={plotRight + PAD_EDGE}
                y2={y(v)}
                stroke={colors.outlineVariant}
                strokeWidth={1}
                opacity={v === 0 ? 0.9 : 0.45}
              />
            ))}
            {gridValues.map((v) => (
              <SvgText
                key={`l${v}`}
                x={uiIsRTL ? plotRight + PAD_EDGE + 4 : plotLeft - PAD_EDGE - 4}
                y={y(v) + 4}
                fill={colors.outline}
                fontSize={10}
                textAnchor={uiIsRTL ? "start" : "end"}
              >
                {String(Math.round(v))}
              </SvgText>
            ))}

            {areaPath ? <Path d={areaPath} fill="url(#trendFill)" /> : null}

            {active ? (
              <Line
                x1={x(selected!)}
                y1={PAD_TOP - 6}
                x2={x(selected!)}
                y2={baseY}
                stroke={color}
                strokeWidth={1}
                opacity={0.45 * tip}
                strokeDasharray={[3, 3]}
              />
            ) : null}

            {drawn.length > 1 ? (
              <Path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* One marker: the selected point, or the latest when nothing is
                selected. A dot on every point would be a number on every
                point — noise, not emphasis. A surface-coloured ring keeps it
                legible where it lands on top of the line. It rides in with the
                line rather than sitting on the baseline waiting for it, and
                pulses once each time the scrub moves it. */}
            {markerIn > 0
              ? (() => {
                  const i = selected ?? n - 1;
                  return (
                    // A Fragment as a direct child of <Svg> is not something
                    // react-native-svg has ever handled reliably; a <G> is the
                    // grouping primitive it actually understands.
                    <G>
                      {active ? (
                        <Circle
                          cx={x(i)}
                          cy={y(values[i])}
                          r={markerR + 6 * tip}
                          fill={color}
                          opacity={0.16 * tip}
                        />
                      ) : null}
                      <Circle
                        cx={x(i)}
                        cy={y(values[i])}
                        r={markerR}
                        fill={color}
                        stroke={colors.surfaceContainerLowest}
                        strokeWidth={2}
                      />
                    </G>
                  );
                })()
              : null}
          </Svg>
        ) : null}

        {/* The scrub surface — one responder over the whole plot, see header. */}
        {width > 0 && n > 0 ? (
          <View
            style={StyleSheet.absoluteFill}
            accessibilityRole="adjustable"
            accessibilityLabel="الرسم البياني — اسحب إصبعك لاستعراض الأيام"
            {...responder.panHandlers}
          />
        ) : null}

        {/* Direct label on the scrubbed point. The summary row above says the
            same thing, but a value you have to look away from the finger to
            read is a value you read once and then stop reading. */}
        {active && width > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.tip,
              {
                left: Math.max(0, Math.min(width - TIP_W, x(selected!) - TIP_W / 2)),
                top: Math.max(0, y(active.value) - 46),
                opacity: tip,
                transform: [{ scale: 0.9 + 0.1 * tip }],
              },
            ]}
          >
            <Text style={styles.tipValue} numberOfLines={1}>
              {active.value}
              {valueSuffix}
            </Text>
            <Text style={styles.tipLabel} numberOfLines={1}>
              {active.label}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── X axis ─────────────────────────────────────────────────────────
          Each label is pinned under the point it describes, using the same
          `x(i)` the line is drawn with, rather than distributed by a flex row.
          A flex row is placed from `rowStart` (derived from the layout engine)
          while the plot is placed from `uiIsRTL`; when those two disagreed the
          dates ran one way and the data ran the other. One source of truth
          makes that impossible, and as a bonus every label now sits under its
          own point instead of merely in the right order. */}
      <View style={styles.xAxis}>
        {width > 0
          ? points.map((p, i) =>
              axisLabels.has(i) ? (
                <Text
                  key={p.date}
                  style={[
                    styles.xLabel,
                    { left: x(i) - 24 },
                    selected === i && styles.xLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {p.label}
                </Text>
              ) : null,
            )
          : null}
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

/** Round a maximum up to something a person reads as a scale (10, 20, 50,
 *  100…) rather than to whatever the tallest bar happened to be. */
function niceCeiling(v: number): number {
  if (v <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const candidate = m * magnitude;
    if (candidate >= v) return candidate;
  }
  return 10 * magnitude;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  summaryRow: { flexDirection: rowStart, alignItems: "baseline", gap: 8 },
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
  tip: {
    position: "absolute",
    width: TIP_W,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.inverseSurface,
    alignItems: "center",
  },
  tipValue: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.fontSize + 4,
    includeFontPadding: false,
    fontFamily: "Alexandria_700Bold",
    color: colors.inverseOnSurface,
    fontVariant: ["tabular-nums"],
  },
  tipLabel: {
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
    fontFamily: "Cairo_400Regular",
    color: colors.inverseOnSurface,
    opacity: 0.8,
  },
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
  xLabelActive: { color: colors.primary, fontFamily: "Cairo_700Bold" },
  action: {
    flexDirection: rowStart,
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
