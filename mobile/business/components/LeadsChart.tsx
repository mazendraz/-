import { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";
import { colors, type } from "@alassema/core";
import { rowStart, textStart, uiIsRTL } from "@alassema/mobile-shared";
import { clamp01, useEased, useReveal } from "./chartMotion";

const PLOT_HEIGHT = 84;
/** Gap between neighbouring bars. 2px of surface between fills is what keeps
 *  adjacent columns reading as separate marks rather than one block. */
const BAR_GAP = 4;
const BAR_RADIUS = 3;
/** A day with zero leads still gets a visible stub, so fourteen days always
 *  read as fourteen columns. Without it the card silently drops its empty
 *  days and the axis stops matching the marks. */
const ZERO_STUB = 2;

/**
 * The overview's lead-volume card — daily counts for the last fortnight.
 *
 * ── Why the SVG is measured rather than scaled ─────────────────────────────
 * This used to draw into a `viewBox="0 0 100 H"` with
 * `preserveAspectRatio="none"`, which stretches the x axis by however many
 * times wider the card is than 100 units (~3.4× on a 1080px phone) while
 * leaving y at 1×. Every length in the drawing inherits that distortion, so
 * `rx={1}` came out as a 3.4px horizontal radius against a 1px vertical one —
 * bars whose corners were visibly lopsided, and which got MORE lopsided on a
 * wider screen. Measuring the width and drawing in real pixels is what makes
 * a 3px radius actually 3px in both directions. The same bug, and the same
 * fix, applies to TrendChart's endpoint dot.
 *
 * ── Direction ──────────────────────────────────────────────────────────────
 * Time runs from the UI's START edge to its END, so on this Arabic build the
 * oldest day sits on the RIGHT and today on the left. The axis labels are laid
 * out with the same `rowStart` the bars are drawn against, so the two can't
 * disagree.
 *
 * Still plain react-native-svg and still deliberately small: the overview
 * answers "what is the state of things", it is not a second analytics screen.
 * `TrendChart` is the interactive one.
 *
 * ── Motion ─────────────────────────────────────────────────────────────────
 * The bars grow out of the baseline in date order and the fortnight total
 * counts up with them, so the card arrives as fourteen days accumulating
 * rather than as a picture that was already there. Individual bars stay
 * non-interactive on purpose — the whole card is one target that opens
 * analytics, and fourteen sub-targets inside a tappable card is a card you
 * cannot reliably tap. Reduced motion skips all of it (`chartMotion.ts`).
 */
export default function LeadsChart({
  perDay,
  onPress,
}: {
  perDay: { date: string; count: number }[];
  /** Where the detail lives. Omit to render a non-interactive card. */
  onPress?: () => void;
}) {
  const [width, setWidth] = useState(0);

  const days = perDay.slice(-14);
  const counts = days.map((d) => d.count);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const peakIndex = days.reduce(
    (best, d, i) => (d.count > (days[best]?.count ?? -1) ? i : best),
    0,
  );
  const peak = days[peakIndex];

  const dataKey = days.map((d) => `${d.date}:${d.count}`).join("|");
  const reveal = useReveal(dataKey, 680);
  // Half the ramp hands the start down the fourteen days; half is how long a
  // single bar takes to reach its height.
  const stagger = days.length > 1 ? 0.5 / (days.length - 1) : 0;
  const growSpan = Math.max(0.001, 1 - stagger * (days.length - 1));
  const totalShown = Math.round(useEased(total, 420));

  const step = days.length > 0 ? width / days.length : 0;
  const barWidth = Math.max(1, step - BAR_GAP);

  /** Slot → x, honouring the UI's reading direction (see header). */
  function slotX(i: number): number {
    const ordinal = uiIsRTL ? days.length - 1 - i : i;
    return ordinal * step + BAR_GAP / 2;
  }

  /** A bar with rounded TOP corners only — the bottom edge belongs to the
   *  baseline, and rounding it there would lift the mark off its own axis. */
  function barPath(x: number, y: number, w: number, h: number): string {
    const r = Math.min(BAR_RADIUS, w / 2, h);
    return [
      `M ${x} ${PLOT_HEIGHT}`,
      `L ${x} ${y + r}`,
      `Q ${x} ${y} ${x + r} ${y}`,
      `L ${x + w - r} ${y}`,
      `Q ${x + w} ${y} ${x + w} ${y + r}`,
      `L ${x + w} ${PLOT_HEIGHT}`,
      "Z",
    ].join(" ");
  }

  const body = (
    <>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.label}>الطلبات آخر أسبوعين</Text>
          <View style={styles.totalRow}>
            <Text style={styles.total}>{totalShown}</Text>
            <Text style={styles.totalUnit}>طلب</Text>
          </View>
        </View>
        {onPress ? <Text style={styles.chevron}>‹</Text> : null}
      </View>

      <View style={styles.plot} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={PLOT_HEIGHT}>
            {/* Recessive baseline: the bars need something to stand on, but it
                must never compete with them. */}
            <Line
              x1={0}
              y1={PLOT_HEIGHT - 0.5}
              x2={width}
              y2={PLOT_HEIGHT - 0.5}
              stroke={colors.outlineVariant}
              strokeWidth={1}
            />
            <G>
              {days.map((d, i) => {
                const x = slotX(i);
                const grow = clamp01((reveal - i * stagger) / growSpan);
                // Nothing to draw yet. A zero-height path still paints its
                // rounded caps as a smear on the baseline.
                if (grow <= 0.01) return null;
                if (d.count === 0) {
                  const stub = ZERO_STUB * grow;
                  return (
                    <Rect
                      key={d.date}
                      x={x}
                      y={PLOT_HEIGHT - stub}
                      width={barWidth}
                      height={stub}
                      fill={colors.outlineVariant}
                    />
                  );
                }
                const h = Math.max(BAR_RADIUS, (d.count / max) * (PLOT_HEIGHT - 14)) * grow;
                return (
                  <Path
                    key={d.date}
                    d={barPath(x, PLOT_HEIGHT - h, barWidth, h)}
                    // The busiest day is the one fact worth picking out of
                    // fourteen bars; everything else stays quiet so it can.
                    fill={i === peakIndex ? colors.primary : colors.primaryContainer}
                    opacity={i === peakIndex ? 1 : 0.45}
                  />
                );
              })}
            </G>
          </Svg>
        ) : null}

        {/* The peak's own value, sat directly over its bar — one direct label
            beats a legend, and beats printing a number on all fourteen. */}
        {width > 0 && peak && peak.count > 0 ? (
          <View
            style={[
              styles.peakBadge,
              {
                left: Math.min(Math.max(0, slotX(peakIndex) + barWidth / 2 - 14), width - 28),
                // Arrives after the bar it labels; a number floating over an
                // empty baseline is a number pointing at nothing.
                opacity: clamp01((reveal - 0.7) / 0.3),
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.peakValue}>{peak.count}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Axis ───────────────────────────────────────────────────────────
          Anchored to PHYSICAL edges rather than laid out with a flex
          direction. The bars above are placed from `uiIsRTL`; a flex row is
          placed from `rowStart`, which is derived from the layout engine.
          Those two agree in a correctly-configured build and disagree in one
          that isn't — and when they disagreed, the chart claimed its oldest
          day was on the side its oldest bar wasn't. Pinning both to the same
          constant makes that mismatch unrepresentable.
          (`left`/`right` stay physical here because ensureRTL() turns
          Android's left/right-swapping off — see rtl.ts.) */}
      {days.length > 0 ? (
        <View style={styles.axis}>
          <Text style={[styles.axisLabel, styles.axisStart]}>
            {(uiIsRTL ? days[days.length - 1] : days[0]).date.slice(5)}
          </Text>
          <Text style={[styles.axisLabel, styles.axisEnd]}>
            {(uiIsRTL ? days[0] : days[days.length - 1]).date.slice(5)}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.wrap}>{body}</View>;

  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.wrapPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`الطلبات آخر أسبوعين: ${total} طلب`}
      accessibilityHint="يفتح التحليلات"
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  wrapPressed: { backgroundColor: colors.surfaceContainer },
  head: { flexDirection: rowStart, alignItems: "flex-start", justifyContent: "space-between" },
  headText: { gap: 2 },
  label: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  totalRow: { flexDirection: rowStart, alignItems: "baseline", gap: 5 },
  total: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
  totalUnit: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  chevron: { fontSize: type.subhead.fontSize, color: colors.outline },
  plot: { height: PLOT_HEIGHT, justifyContent: "flex-end" },
  peakBadge: { position: "absolute", top: 0, width: 28, alignItems: "center" },
  peakValue: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Cairo_700Bold",
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  axis: { height: 14 },
  axisLabel: {
    position: "absolute",
    top: 0,
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
  },
  axisStart: { left: 0 },
  axisEnd: { right: 0 },
});
