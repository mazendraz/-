import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { TextStyle } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors, type } from "@alassema/core";
import { rowStart } from "@alassema/mobile-shared";

/**
 * The bottom tab bar, drawn by hand instead of by react-navigation's default
 * <BottomTabBar>.
 *
 * ── Why a custom bar ────────────────────────────────────────────────────────
 * The default bar can be tinted (tabBarActiveTintColor) and resized
 * (tabBarStyle) and nothing else. The two things this redesign is actually
 * built around — a rounded, brand-tinted pill sitting BEHIND the active icon,
 * and the floating, fully rounded card the five tabs sit in — have no option
 * to switch on, because the default bar renders icon and label as one
 * inseparable stack inside a square container welded to the screen edges.
 *
 * ── What it still owes react-navigation ─────────────────────────────────────
 * A custom `tabBar` opts out of the default bar's behavior wholesale, not
 * just its looks, so three things it used to do for free are re-implemented
 * below and must stay:
 *   1. `navigation.emit("tabPress", { canPreventDefault: true })` BEFORE
 *      navigating — that event is what (tabs)/_layout.tsx's guest guards
 *      listen for. Skip it and every account-only tab silently opens for a
 *      signed-out visitor.
 *   2. `tabLongPress`, emitted for parity even though nothing listens yet.
 *   3. Honouring `href: null`. expo-router compiles that to
 *      `tabBarItemStyle: { display: "none" }` (see its useScreens.js) and
 *      trusts the BAR to skip the route — a custom bar that maps over
 *      `state.routes` blindly puts hidden screens back in the tab bar.
 */

// One size for all five glyphs, active or not: the active tab earns its
// weight from the pill and the brand color behind it, not from a bigger icon
// (which is what makes a bar look uneven as the selection moves).
const ICON_SIZE = 24;
// 54, not 58: the card's side inset narrows every cell, and on a 320dp phone
// a fifth is only 59 wide. 54 keeps a margin either side even there.
const PILL_WIDTH = 54;
const PILL_HEIGHT = 32;
// Icon row + label, excluding the card's own padding and the safe area.
const BAR_CONTENT_HEIGHT = 64;
// What the GROUND pads by below the card on a phone with no home indicator
// (insets.bottom = 0) — the gap that makes the card look like it floats.
const MIN_BOTTOM_PAD = 12;
// How far the card is held off the screen's side edges, and off the content
// above it.
const CARD_INSET = 12;
const CARD_TOP_GAP = 8;
// A rounded rectangle rather than a stadium: at 28 a 64-tall card would be
// all corner and no edge.
const CARD_RADIUS = 24;
// colors.primary (#005578) at 12% — a tint of the brand blue, not a second
// blue. Written out rather than composed because RN takes no color-mix.
const ACTIVE_PILL_BG = "rgba(0, 85, 120, 0.12)";

/**
 * The soft lift under each glyph — a shadow on the ICON only, which is what
 * gives the row its slight relief without putting a single extra shape on
 * screen.
 *
 * `textShadow*`, not a wrapping <View> with `shadowOffset`: an icon from
 * @expo/vector-icons IS a <Text>, and a view shadow needs an opaque
 * background to render at all on iOS, or an `elevation` that would also lift
 * the wrapper out of the pill on Android. A text shadow tracks the glyph's
 * own outline on both platforms, which is exactly the shape it should follow.
 *
 * Idle glyphs get a nearly invisible grey lift; the active one gets a
 * brand-blue glow of the same shape, so the selected tab reads as raised
 * rather than merely recolored. Exported because a tab's icon is built in
 * (tabs)/_layout.tsx, where `tabBarIcon` is declared — the bar receives the
 * finished element and has nowhere left to style it.
 */
const lift = StyleSheet.create({
  idle: {
    textShadowColor: "rgba(24, 28, 31, 0.18)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  active: {
    textShadowColor: "rgba(0, 85, 120, 0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
});

export function tabIconLift(focused: boolean): TextStyle {
  return focused ? lift.active : lift.idle;
}

export default function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    // Two layers, and both are load-bearing. The card is inset on all four
    // sides and rounded the whole way round, so a strip of whatever sits
    // BEHIND the bar frames it — with no ground of its own that strip is
    // react-navigation's theme background, which is not this app's. `ground`
    // pins it to the same surface the screens use, so the card reads as
    // floating on the page rather than as a white shape on a stray color.
    //
    // The safe area is padding on the GROUND, not on the card: on an iPhone
    // the card has to stop ABOVE the home indicator, not swallow it.
    <View style={[styles.ground, { paddingBottom: Math.max(insets.bottom, MIN_BOTTOM_PAD) }]}>
      <View style={styles.card}>
        {/* The clip is its own view, not `overflow: "hidden"` on the card: on
            Android that property and `elevation` on the SAME view cancel each
            other's shadow on several OS versions. Splitting them lets the card
            keep its shadow while this layer keeps the borderless ripple from
            bleeding past the rounded corners. */}
        <View style={styles.clip}>
          <View style={styles.row}>
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              // See (3) in the header comment — expo-router's `href: null`.
              if (StyleSheet.flatten(options.tabBarItemStyle)?.display === "none") return null;

              const focused = state.index === index;
              const tint = focused ? colors.primary : colors.outline;
              const label = options.title ?? route.name;

              function onPress() {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                  testID={options.tabBarButtonTestID}
                  onPress={onPress}
                  onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                  // borderless, so no hard rectangle appears on a bar that has
                  // no dividers — the clip above is what keeps it inside the
                  // card's corners.
                  android_ripple={{ color: ACTIVE_PILL_BG, borderless: true, radius: 40 }}
                  style={styles.item}
                >
                  {({ pressed }) => (
                    <View style={[styles.itemInner, pressed && styles.itemPressed]}>
                      <View style={[styles.pill, focused && styles.pillActive]}>
                        {options.tabBarIcon?.({ focused, color: tint, size: ICON_SIZE })}
                      </View>
                      <Text numberOfLines={1} style={[styles.label, { color: tint }, focused && styles.labelActive]}>
                        {label}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: {
    backgroundColor: colors.surface,
    paddingHorizontal: CARD_INSET,
    paddingTop: CARD_TOP_GAP,
  },
  clip: { borderRadius: CARD_RADIUS, overflow: "hidden" },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: CARD_RADIUS,
    // A hairline all the way round, which a fully rounded card CAN have — the
    // top-edge-only border this replaced could not, because a straight line
    // stopping dead at a curve reads as a drawing mistake. It keeps the card's
    // edge legible on the light ground, where the shadow alone is too soft to
    // define one.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(191, 199, 207, 0.55)",
    ...Platform.select({
      // Cast DOWNWARD now, not up: a floating card is lit like an object on a
      // page, where an upward shadow only made sense while the bar was still
      // welded to the bottom edge.
      ios: {
        shadowColor: "#0b1720",
        shadowOpacity: 0.1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
      },
      // Android draws its shadow from `elevation`, and needs the background
      // color above to cast one at all. shadowColor is honoured from API 28
      // and ignored (plain grey) below it — no fallback needed either way.
      android: { elevation: 10, shadowColor: "#0b1720" },
      default: null,
    }),
  },
  // rowStart, not "row": under forceRTL Yoga swaps row/row-reverse, so this is
  // the one value that puts الرئيسية on the RIGHT both on a device and in Expo
  // web (see lib/rtl.ts).
  row: { flexDirection: rowStart, height: BAR_CONTENT_HEIGHT, alignItems: "stretch" },
  // flex: 1 with no basis — five identical fifths whatever the screen width.
  item: { flex: 1 },
  itemInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  itemPressed: { opacity: 0.55 },
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: ACTIVE_PILL_BG },
  label: {
    fontFamily: "Cairo_500Medium",
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    textAlign: "center",
  },
  labelActive: { fontFamily: "Cairo_700Bold" },
});
