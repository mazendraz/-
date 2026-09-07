import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { rowLtr, rowStart, textStart } from "@alassema/mobile-shared";

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
 *
 * ── Why the tiles are a fixed height ───────────────────────────────────────
 * These are laid out two to a row, and only some of them carry a delta. A tile
 * that sizes to its content therefore left one number sitting at the top of a
 * tall box next to another sitting in the middle of a short one — the rows
 * looked broken even though both tiles were correct. `minHeight` plus a
 * bottom-anchored delta slot means every tile in a row shares one baseline
 * whether or not it has a trend to report.
 *
 * ── Why the delta is built from two Texts ──────────────────────────────────
 * It used to be the single string `` `${sign}${Math.round(delta)}%` ``. In an
 * Arabic (RTL) paragraph the leading "+" is a bidi-neutral character with
 * nothing strongly-LTR before it, so the renderer resolves it to the
 * paragraph's own direction and moves it to the far side: "+14%" shipped, and
 * displayed, as "14%+". Splitting the direction indicator from the number and
 * laying the two out in an explicitly left-to-right row removes the ambiguity
 * rather than papering over it with an invisible control character.
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
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {onPress ? <Text style={styles.chevron}>‹</Text> : null}
      </View>

      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>

      {deltaPercent !== undefined ? (
        <View style={styles.deltaSlot}>
          <Delta delta={deltaPercent} />
        </View>
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

/** The trend pill. Direction is carried by an arrow AND by colour, never by
 *  colour alone — the same rule the charts follow. */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <View style={[styles.deltaPill, styles.deltaPillFlat]}>
        <Text style={[styles.deltaText, styles.deltaTextFlat]}>جديد</Text>
      </View>
    );
  }

  const rounded = Math.round(delta);
  const up = rounded > 0;
  const flat = rounded === 0;

  return (
    <View
      style={[
        styles.deltaPill,
        flat ? styles.deltaPillFlat : up ? styles.deltaPillUp : styles.deltaPillDown,
      ]}
    >
      <Text
        style={[
          styles.deltaText,
          flat ? styles.deltaTextFlat : up ? styles.deltaTextUp : styles.deltaTextDown,
        ]}
      >
        {flat ? "—" : up ? "▲" : "▼"}
      </Text>
      <Text
        style={[
          styles.deltaText,
          styles.deltaNumber,
          flat ? styles.deltaTextFlat : up ? styles.deltaTextUp : styles.deltaTextDown,
        ]}
      >
        {Math.abs(rounded)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 140,
    // Tall enough for label + number + the delta slot, so a tile with a trend
    // and one without still line up. See the header comment.
    minHeight: 116,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  tilePressed: { backgroundColor: colors.surfaceContainer },
  labelRow: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", gap: 6 },
  chevron: { fontSize: type.body.fontSize, color: colors.outline },
  label: {
    flex: 1,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  value: {
    fontSize: type.headline.fontSize,
    lineHeight: type.headline.fontSize + 6,
    includeFontPadding: false,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
    fontVariant: ["tabular-nums"],
  },
  // Anchored to the bottom of the tile so every delta in a row shares a line.
  deltaSlot: { marginTop: "auto", alignItems: textStart === "right" ? "flex-end" : "flex-start" },
  deltaPill: {
    flexDirection: rowLtr,
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deltaPillUp: { backgroundColor: colors.successContainer },
  deltaPillDown: { backgroundColor: colors.errorContainer },
  deltaPillFlat: { backgroundColor: colors.surfaceContainer },
  deltaText: {
    fontSize: 11,
    lineHeight: 15,
    includeFontPadding: false,
    fontFamily: "Cairo_700Bold",
  },
  deltaNumber: { fontVariant: ["tabular-nums"] },
  deltaTextUp: { color: colors.onSuccessContainer },
  deltaTextDown: { color: colors.onErrorContainer },
  deltaTextFlat: { color: colors.onSurfaceVariant },
});
