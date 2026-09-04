import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * The horizontal filter/segment bar, and the chip that goes in it.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Five screens had hand-rolled a horizontal `ScrollView` of pills, and three of
 * them shipped the same bug: a horizontal ScrollView is still a flex child of
 * the column around it, so when the content BELOW is short it grows to fill the
 * leftover height and stretches every chip into a tall lozenge. It only shows
 * on an empty list — precisely when nobody is looking for a layout bug — which
 * is why it survived in the approvals queues, the analytics range picker and
 * the Control Centre's report picker simultaneously.
 *
 * `flexGrow: 0` + `alignItems: "center"` is the fix, and it lives here once so
 * the sixth screen to want a filter bar cannot reintroduce it.
 *
 * Chips are a fixed 40px minimum height for the same reason they are one
 * component: a filter row whose targets shrink with their label length is
 * harder to hit for exactly the people who most need a comfortable target.
 */
export function ChipBar({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={[styles.barContent, style]}
    >
      {children}
    </ScrollView>
  );
}

export function Chip({
  label,
  active,
  onPress,
  badge,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  /** A real count. Omitted (not 0) when there is nothing to report. */
  badge?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && !active && styles.chipPressed,
      ]}
      accessibilityRole="button"
      // `selected` is what a screen reader uses to announce which filter is
      // active — colour alone conveys nothing to it.
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={accessibilityLabel ?? (badge ? `${label}: ${badge}` : label)}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      {badge ? (
        <View style={[styles.badge, active && styles.badgeActive]}>
          <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The two properties this whole component exists to get right.
  bar: { flexGrow: 0, flexShrink: 0 },
  barContent: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surfaceContainer,
  },
  chipPressed: { backgroundColor: colors.surfaceContainerHigh },
  chipActive: { backgroundColor: colors.primary },
  label: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  labelActive: { color: colors.onPrimary, fontFamily: "Cairo_700Bold" },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: { backgroundColor: colors.onPrimary },
  badgeText: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onError,
    // Centres the digit in its circle. Without it the glyph sits high on
    // Android, which reads as a misaligned badge rather than a round one.
    textAlign: "center",
    lineHeight: 18,
  },
  badgeTextActive: { color: colors.primary },
});
