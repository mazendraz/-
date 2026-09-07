import { StyleSheet, Text, View } from "react-native";
import { colors } from "@alassema/core";

/**
 * A circular initial avatar.
 *
 * ── Why this is a component and not three lines of inline style ────────────
 * Every screen that shows a person or a company wanted the same circle with
 * the same letter in it, and each one centred that letter by putting
 * `alignItems: "center"` on the circle and hoping. That is not enough on
 * Android: `Text` reserves extra vertical space from the font's own
 * ascent/descent metrics (`includeFontPadding`, on by default), and
 * Alexandria's metrics are generous enough that the glyph sits visibly above
 * the centre of its circle. The result reads as a misaligned avatar rather
 * than a round one, and it was wrong identically in several places.
 *
 * Turning that padding off and pinning `lineHeight` to the circle's diameter
 * is what actually puts the letter in the middle, and doing it here means the
 * next screen to want an avatar gets it right without knowing any of this.
 *
 * The initial is derived from the first grapheme rather than `charAt(0)` so an
 * Arabic name, or any name outside the BMP, doesn't render half a character.
 */
export default function Avatar({
  name,
  size = 44,
  color = colors.primary,
}: {
  name: string | null | undefined;
  size?: number;
  color?: string;
}) {
  const initial = firstGrapheme(name) || "؟";
  // Proportional so the letter fills the circle the same way at every size.
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
    >
      <Text
        style={[styles.text, { fontSize, lineHeight: size }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {initial}
      </Text>
    </View>
  );
}

function firstGrapheme(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  // Array spread splits on code POINTS, so an emoji or a non-BMP letter
  // survives; charAt(0) would return half of its surrogate pair.
  return [...trimmed][0].toUpperCase();
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  text: {
    fontFamily: "Alexandria_700Bold",
    color: colors.onPrimary,
    textAlign: "center",
    // The two properties this component exists to get right — see above.
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
