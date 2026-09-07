import { useEffect, useState } from "react";
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import { clamp01, useEased, useReveal } from "./chartMotion";

const DEFAULT_SIZE = 156;
const DEFAULT_STROKE = 22;
/** How much a selected arc thickens. The radius is derived from SIZE minus
 *  BOTH the stroke and this, so the emphasised arc still fits inside the
 *  canvas — it used to be added on top of a radius computed without it, which
 *  pushed the selected arc's outer edge 2px past the SVG bounds and clipped a
 *  flat edge onto the one slice the user had just asked to see. */
const SELECTED_EXTRA = 4;
/** Surface gap between neighbouring arcs, in px of arc length. Two fills that
 *  touch read as one; a small gap is what separates them. */
const ARC_GAP = 3;

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
 * ── The centre is a fixed frame, not a stack that grows ────────────────────
 * The centre used to render two lines normally and three when a slice was
 * selected, inside a box that centred whatever it was given. Selecting a slice
 * therefore re-centred the whole group and the big number visibly jumped —
 * the one element that should be nailed to the middle of the ring was the one
 * that moved. It is now a fixed-height three-row frame: the value always sits
 * on the ring's centre line, and the share row below it is reserved whether or
 * not it currently has anything in it.
 *
 * Every line also carries an explicit `lineHeight` and `includeFontPadding:
 * false`. Android otherwise pads text by the font's own ascent/descent
 * metrics, and Alexandria's are generous enough that a centred number sits
 * visibly high in its circle — the difference between a number that is in the
 * middle and one that is merely inside.
 *
 * ── The ring answers the tap it invites ────────────────────────────────────
 * A donut slice invites a tap. This one used to ignore it: the arcs were inert
 * SVG and only the legend rows beside them were pressable, so the single most
 * obvious gesture on the card — put a finger on the big blue wedge — did
 * nothing, and the card read as a picture. `react-native-svg`'s own per-shape
 * hit-testing is not dependable enough to fix that (and a stroked arc's hit
 * area is its bounding circle, not its wedge), so the geometry is done here
 * instead: one transparent overlay measures where the finger landed, rejects
 * anything outside the ring band, converts the angle to a fraction of the
 * circle, and looks up which arc owns it. A tap in the hole clears the
 * selection, which is the other thing a finger tries.
 *
 * Selecting a slice fills the centre with that status's own count and share
 * and reveals the caller's drill-down action; tapping it again clears it.
 * Every slice is also named in the legend beside it, so identity never rests
 * on colour alone.
 *
 * ── Motion ─────────────────────────────────────────────────────────────────
 * The ring sweeps open once from twelve o'clock — one continuous sweep across
 * all the arcs rather than each fading in on its own, because the thing being
 * drawn is one circle divided up, not five separate bars. The centre figure
 * rolls between values and the selected arc thickens over a few frames.
 * Skipped entirely under reduced motion — see `chartMotion.ts`.
 */
export default function DonutChart({
  slices,
  centerLabel,
  onSelect,
  actionLabel,
  size = DEFAULT_SIZE,
  stacked = false,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  /** Called with the selected slice when the caller's action is tapped. */
  onSelect?: (slice: DonutSlice) => void;
  actionLabel?: (slice: DonutSlice) => string;
  /** Bigger when opened full-screen — see ExpandedChart. */
  size?: number;
  /** Ring above the legend instead of beside it. At full-screen width a
   *  side-by-side ring wastes most of the height it was given. */
  stacked?: boolean;
}) {
  const SIZE = size;
  const STROKE = Math.round(size * (DEFAULT_STROKE / DEFAULT_SIZE));
  const R = (SIZE - STROKE - SELECTED_EXTRA * 2) / 2;
  const C = 2 * Math.PI * R;
  const scale = SIZE / DEFAULT_SIZE;
  const [selected, setSelected] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = slices.find((s) => s.key === selected) ?? null;

  // Identity of the DATA — the analytics screen keeps this component mounted
  // while the period chips change the numbers underneath it, so a mount-only
  // sweep would play once and never again.
  const dataKey = slices.map((s) => `${s.key}:${s.value}`).join("|");
  const reveal = useReveal(dataKey, 760);

  // A key that no longer exists after a period change would leave the centre
  // showing a status the ring no longer draws.
  useEffect(() => {
    setSelected(null);
  }, [dataKey]);

  // One 0/1 ramp for "something is selected", not one per arc: hooks cannot
  // live in a loop, and moving the selection straight from one slice to
  // another should move the emphasis, not fade it out and back in.
  const selAmt = useEased(selected === null ? 0 : 1, 200);
  const centerShown = Math.round(useEased(active ? active.value : total, 400));
  const shareShown = Math.round(
    useEased(active && total ? (active.value / total) * 100 : 0, 400),
  );

  // Only slices with a value get an arc; a zero slice would otherwise consume
  // a gap and leave a notch in the ring for a status nobody has.
  const drawn = slices.filter((s) => s.value > 0);

  // Running offset so each arc starts where the previous one ended.
  let offset = 0;
  const arcs = drawn.map((s) => {
    const fraction = total ? s.value / total : 0;
    const full = C * fraction;
    // Never let the gap eat a thin slice entirely.
    const dash = drawn.length > 1 ? Math.max(full - ARC_GAP, Math.min(full, 1.5)) : full;
    const arc = { slice: s, dash, start: offset, fraction, offset: C * offset };
    offset += fraction;
    return arc;
  });

  /** Where the finger landed, in ring terms. Returns the slice key it hit,
   *  `null` for the hole in the middle (a deliberate "clear"), or `undefined`
   *  for a miss outside the ring, which should change nothing at all. */
  function hitTest(e: GestureResponderEvent): string | null | undefined {
    const dx = e.nativeEvent.locationX - SIZE / 2;
    const dy = e.nativeEvent.locationY - SIZE / 2;
    const distance = Math.hypot(dx, dy);
    const band = STROKE / 2 + SELECTED_EXTRA;
    // A little generosity outward and inward: the drawn band is ~22px, a
    // fingertip is not.
    if (distance < R - band - 6) return null;
    if (distance > R + band + 6) return undefined;
    // atan2 measures from 3 o'clock and the ring is rotated to start at 12,
    // so the same +90° the <G> applies has to be undone here.
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    const fraction = angle / 360;
    const hit = arcs.find((a) => fraction >= a.start && fraction < a.start + a.fraction);
    return hit ? hit.slice.key : undefined;
  }

  function onRingTouch(e: GestureResponderEvent) {
    const hit = hitTest(e);
    if (hit === undefined) return;
    setSelected((prev) => (hit !== null && prev === hit ? null : hit));
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.chartRow, stacked && styles.chartColumn]}>
        <View style={[styles.donut, { width: SIZE, height: SIZE }]}>
          <Svg width={SIZE} height={SIZE}>
            {/* Track behind the arcs — gives the ring a shape even before the
                data does, and stops the gaps reading as holes. */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={colors.surfaceContainer}
              strokeWidth={STROKE}
            />
            {/* -90° so the first slice starts at 12 o'clock rather than 3. */}
            <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
              {arcs.map(({ slice, dash, offset: o }) => {
                // The sweep is one arc length travelling around the whole
                // circle; each slice shows however much of itself that front
                // has passed. Arcs the sweep has not reached yet draw nothing
                // rather than a zero-length dash, which some renderers show as
                // a dot.
                const shown = Math.min(dash, Math.max(0, C * reveal - o));
                if (shown <= 0.5) return null;
                const isActive = selected === slice.key;
                return (
                  <Circle
                    key={slice.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={STROKE + (isActive ? SELECTED_EXTRA * selAmt : 0)}
                    strokeLinecap="butt"
                    strokeDasharray={`${shown} ${C - shown}`}
                    strokeDashoffset={-o}
                    opacity={isActive || !selected ? 1 : 1 - 0.7 * clamp01(selAmt)}
                  />
                );
              })}
            </G>
          </Svg>

          {/* Fixed frame — see the header comment. The share row is reserved
              whether or not it has content, and an identical spacer is
              reserved ABOVE it, so the value/label pair stays on the ring's
              own centre line instead of being pushed up by the space held
              open beneath it. Reserving on one side only is what made the
              number sit high. */}
          <View style={styles.center} pointerEvents="none">
            <View style={styles.centerSpacer} />
            <Text
              style={[
                styles.centerValue,
                scale !== 1 && {
                  fontSize: Math.round(type.title.fontSize * scale),
                  lineHeight: Math.round((type.title.fontSize + 4) * scale),
                },
              ]}
              numberOfLines={1}
            >
              {centerShown}
            </Text>
            <Text style={styles.centerLabel} numberOfLines={1}>
              {active ? active.label : centerLabel}
            </Text>
            <Text style={styles.centerShare} numberOfLines={1}>
              {active && total ? `${shareShown}%` : " "}
            </Text>
          </View>

          {/* The ring's own touch surface — see the header. It sits above both
              the SVG and the centre frame, and yields to the scroll view the
              moment a drag turns into a scroll. */}
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => true}
            onResponderRelease={onRingTouch}
            accessibilityRole="button"
            accessibilityLabel="حالات الطلبات — اضغط على أي جزء من الحلقة لعرض تفاصيله"
          />
        </View>

        <View style={[styles.legend, stacked && styles.legendWide]}>
          {slices.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setSelected(selected === s.key ? null : s.key)}
              style={({ pressed }) => [
                styles.legendRow,
                selected === s.key && styles.legendRowActive,
                pressed && styles.legendRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === s.key }}
              accessibilityLabel={`${s.label}: ${s.value}`}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: s.color },
                  selected === s.key && styles.dotActive,
                ]}
              />
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
  chartRow: { flexDirection: rowStart, alignItems: "center", gap: 16 },
  chartColumn: { flexDirection: "column", gap: 20 },
  legendWide: { alignSelf: "stretch", width: "100%" },
  donut: { alignItems: "center", justifyContent: "center" },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    // Keeps long labels off the ring rather than letting them run under it.
    paddingHorizontal: DEFAULT_STROKE + 6,
  },
  centerSpacer: { height: 16 },
  centerValue: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.fontSize + 4,
    includeFontPadding: false,
    textAlignVertical: "center",
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  centerLabel: {
    fontSize: type.caption.fontSize,
    lineHeight: 16,
    includeFontPadding: false,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  centerShare: {
    fontSize: type.caption.fontSize,
    lineHeight: 16,
    includeFontPadding: false,
    fontFamily: "Cairo_700Bold",
    color: colors.primary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  legend: { flex: 1, gap: 2 },
  legendRow: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  legendRowPressed: { backgroundColor: colors.surfaceContainerHigh },
  legendRowActive: { backgroundColor: colors.surfaceContainer },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { width: 14, height: 14, borderRadius: 7 },
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
