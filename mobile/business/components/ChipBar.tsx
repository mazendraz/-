import { Children, useCallback, useRef, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { colors, type } from "@alassema/core";
import { rowStart } from "@alassema/mobile-shared";

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
/**
 * ── Opening the bar at its own start ───────────────────────────────────────
 * A horizontal ScrollView does not necessarily open showing the first of its
 * children. Where the first chip physically sits depends on the flex direction
 * resolved against the LAYOUT ENGINE's direction, and where `contentOffset.x`
 * starts depends on the engine too — and those two can disagree. In the
 * combination this app actually runs in, the bar opened scrolled past "الكل",
 * the filter that is selected by default: the leads screen showed a filter row
 * whose active filter was off screen.
 *
 * The first version of this fix reasoned about direction from `rowStart` and
 * scrolled to one fixed end. That was wrong, because the premise `rowStart` is
 * built on — that `I18nManager.isRTL` describes the engine — is exactly what
 * fails here (Expo Go reports `false` while the engine is genuinely RTL), and
 * the two failing combinations need scrolling in OPPOSITE directions. Any rule
 * derived from those constants is right in one and backwards in the other.
 *
 * So this measures instead of reasoning. The first chip reports its own `x`
 * inside the content; whichever half of the content it landed in is the end
 * the bar should open at. That is correct under an RTL engine, an LTR one, and
 * the mismatched state in between, without asking which one it is.
 */
function useOpenAtStart() {
  const ref = useRef<ScrollView | null>(null);
  const firstChipX = useRef<number | null>(null);
  const contentWidth = useRef(0);
  // Only the FIRST settle — after that the scroll position belongs to whoever
  // is using the bar, and yanking it back on every content change (a badge
  // count arriving, a queue refreshing) would fight them.
  const settled = useRef(false);

  const settle = useCallback(() => {
    const x = firstChipX.current;
    if (settled.current || x == null || contentWidth.current <= 0) return;
    settled.current = true;
    // Left half → the start is the left end; right half → the right end.
    if (x < contentWidth.current / 2) ref.current?.scrollTo({ x: 0, animated: false });
    else ref.current?.scrollToEnd({ animated: false });
  }, []);

  const onFirstChipLayout = useCallback(
    (e: LayoutChangeEvent) => {
      firstChipX.current = e.nativeEvent.layout.x;
      settle();
    },
    [settle],
  );

  const onContentSizeChange = useCallback(
    (w: number) => {
      contentWidth.current = w;
      settle();
    },
    [settle],
  );

  return { ref, onFirstChipLayout, onContentSizeChange };
}

export function ChipBar({ children, style }: { children: ReactNode; style?: object }) {
  const { ref, onFirstChipLayout, onContentSizeChange } = useOpenAtStart();

  // Only the first chip is wrapped, and only to read its x. The wrapper is a
  // plain flex item with no styling, so it sits in the row exactly where the
  // chip itself would have.
  const items = Children.toArray(children);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={[styles.barContent, style]}
      onContentSizeChange={onContentSizeChange}
    >
      {items.map((child, i) =>
        i === 0 ? (
          <View key="first" onLayout={onFirstChipLayout}>
            {child}
          </View>
        ) : (
          child
        ),
      )}
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
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: rowStart,
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
