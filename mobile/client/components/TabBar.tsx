import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { TextStyle } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import { rowStart, bodyLine, uiIsRTL } from "@alassema/mobile-shared";
import Icon from "./Icon";
import { activeTab, TABS, type TabDef } from "../lib/navShell";
import { useCustomerAuth } from "../lib/customerAuth";
import { useUnreadMessages, useUnreadNotifications } from "../lib/unreadStore";
import { showGuestPrompt } from "../lib/authGate";

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
 * ── Why it no longer takes BottomTabBarProps ────────────────────────────────
 * It used to be handed to <Tabs> as `tabBar={...}`, which meant it was drawn
 * BY the tab navigator and therefore existed only while a tab screen was the
 * top of the stack. Every internal screen — a category, a company profile, a
 * chat — is a sibling of the `(tabs)` group in the ROOT stack, so pushing one
 * covered the tab navigator and took the bar with it. That is the whole
 * "bottom bar disappears once you go one level deep" bug.
 *
 * So the bar is now mounted by components/AppShell.tsx, OUTSIDE the
 * navigator, and drives navigation itself:
 *   - the five tabs come from lib/navShell.ts's TABS, not from the
 *     navigator's `state.routes` (which also retires the `href: null`
 *     dance — a tab with no bar slot is simply not in that list);
 *   - which one is lit comes from `activeTab(pathname)`, so it stays lit
 *     through nested screens instead of only on the tab's own route;
 *   - the guest guards that used to hang off `tabPress` listeners in
 *     (tabs)/_layout.tsx run here, since that event can no longer fire.
 *
 * Everything below the constants is unchanged: this is the same bar,
 * pixel for pixel, with a different owner.
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

// ── Unread badge ────────────────────────────────────────────────────────────
// The red count that rides on a tab's icon — the same affordance the Business
// App gets for free from react-navigation's `tabBarBadge` (see mobile/business
// app/(admin)/_layout.tsx's الموافقات tab). This bar is hand-drawn, so it has
// to draw its own.
//
// 18 tall, not 20: it sits INSIDE the 32-tall pill's top corner, and anything
// larger reads as a second element beside the icon rather than a marker on it.
const BADGE_SIZE = 18;
// Past 99 the number stops being information and starts being a wide pill that
// unbalances the row — every messaging app caps it for the same reason.
const BADGE_MAX = 99;
// The icon is 24 wide inside a 54-wide pill, so its edge is at (54-24)/2 = 15.
// 9 puts the badge's own edge just outside the glyph, overlapping its corner.
const BADGE_INSET = 9;

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
 * rather than merely recolored. Local again now that the bar builds its own
 * icons from lib/navShell.ts's TABS — it used to be exported because the
 * icons were declared as `tabBarIcon` over in (tabs)/_layout.tsx and arrived
 * here already rendered.
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

function tabIconLift(focused: boolean): TextStyle {
  return focused ? lift.active : lift.idle;
}

/** Which count, if any, rides on a given tab's icon. 0 draws nothing. */
function badgeFor(href: TabDef["href"], messages: number, notifications: number): number {
  if (href === "/messages") return messages;
  if (href === "/account") return notifications;
  return 0;
}

export default function TabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { customer } = useCustomerAuth();
  const current = activeTab(pathname);
  // Kept current by (tabs)/_layout.tsx's useBadgeCountsSync — this bar only
  // reads. Both are zero while signed out, so the guarded tabs never show a
  // stranger's count.
  const unreadMessages = useUnreadMessages();
  const unreadNotifications = useUnreadNotifications();

  function onPress(tab: TabDef) {
    // The guest guards, carried over verbatim from the `tabPress` listeners
    // in (tabs)/_layout.tsx. That event belonged to the tab navigator and can
    // no longer fire now that this bar sits outside it, so the interception
    // happens here instead. Each of the gated screens still guards ITSELF
    // with useRequireAccount (see lib/authGate.ts) — that is what covers deep
    // links and signing out mid-session; this only keeps the friendlier
    // "here is what you get" prompt in front of a normal tab tap.
    if (tab.guard && !customer) {
      if (tab.guard === "sign-in") {
        router.push({ pathname: "/sign-in", params: { next: tab.href } });
      } else {
        showGuestPrompt({
          ...tab.guard,
          next: tab.href,
          secondary: { label: "ليس الآن", kind: "dismiss" },
        });
      }
      return;
    }

    // Already sitting on this tab's own screen — a second tap has nothing to
    // do, and navigating anyway would push a duplicate of the screen the
    // customer is already looking at.
    if (pathname === tab.href) return;

    // `navigate`, not `push`: the five tabs live inside the `(tabs)` group at
    // the BOTTOM of the root stack, so this resolves to the group already in
    // the history — react-navigation unwinds whatever internal screens are
    // stacked on top and selects the tab, rather than stacking a sixth copy
    // of the shell. Tapping the tab you are already inside (but three screens
    // deep) therefore returns you to its root, which is the standard
    // behaviour on both platforms.
    router.navigate(tab.href);
  }

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
            {TABS.map((tab) => {
              const focused = current?.href === tab.href;
              const tint = focused ? colors.primary : colors.outline;
              // The lookup the comment above used to promise: a badged tab
              // is one entry here, not a second copy of the markup.
              //
              // حسابي carries the NOTIFICATION count because that is the tab
              // the notification centre lives one tap inside — (tabs)/
              // account.tsx's الإشعارات row is its only entry point, so the
              // count is cleared by the same tap that reveals it. The lead
              // notifications are deliberately NOT split onto طلباتي for the
              // opposite reason: opening that tab reads nothing, so a badge
              // there would light up and never go out.
              const badge = badgeFor(tab.href, unreadMessages, unreadNotifications);

              return (
                <Pressable
                  key={tab.href}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={
                    badge > 0 ? `${tab.label} — ${badge} غير مقروءة` : tab.label
                  }
                  onPress={() => onPress(tab)}
                  // borderless, so no hard rectangle appears on a bar that has
                  // no dividers — the clip above is what keeps it inside the
                  // card's corners.
                  android_ripple={{ color: ACTIVE_PILL_BG, borderless: true, radius: 40 }}
                  style={styles.item}
                >
                  {({ pressed }) => (
                    <View style={[styles.itemInner, pressed && styles.itemPressed]}>
                      <View style={[styles.pill, focused && styles.pillActive]}>
                        <Icon name={tab.icon} color={tint} size={ICON_SIZE} style={tabIconLift(focused)} />
                        {badge > 0 && (
                          <View style={styles.badge} pointerEvents="none">
                            <Text style={styles.badgeText} numberOfLines={1}>
                              {badge > BADGE_MAX ? `${BADGE_MAX}+` : String(badge)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text numberOfLines={1} style={[styles.label, { color: tint }, focused && styles.labelActive]}>
                        {tab.label}
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
  badge: {
    position: "absolute",
    // -1, not 0: the badge's own border laps over the pill's top edge, which
    // is what makes it read as sitting ON the icon rather than beside it.
    top: -1,
    // PHYSICAL left/right, chosen by the UI's direction — not `start`/`end`.
    // ensureRTL() calls I18nManager.swapLeftAndRightInRTL(false) (see
    // packages/mobile-shared/src/rtl.ts), so `left` means left on both
    // platforms and in both engines, while a logical inset would resolve
    // against the ENGINE — which is LTR in Expo web and RTL on a device, i.e.
    // the badge would jump sides between the two. RTL puts it on the icon's
    // LEFT corner, matching where react-navigation's own tabBarBadge lands in
    // an RTL app (the Business App screenshot this mirrors).
    ...(uiIsRTL ? { left: BADGE_INSET } : { right: BADGE_INSET }),
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    paddingHorizontal: 5,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    // A ring in the card's own color, so the badge stays legible where it
    // overlaps the dark glyph underneath it.
    borderWidth: 2,
    borderColor: colors.surfaceContainerLowest,
  },
  badgeText: {
    color: colors.onError,
    fontFamily: "Cairo_700Bold",
    // Two points under the caption size: this is a marker, not a label, and at
    // caption size "12" alone is as wide as the pill it sits on.
    fontSize: type.caption.fontSize - 2,
    lineHeight: BADGE_SIZE - 4,
    textAlign: "center",
  },
  label: {
    fontFamily: "Cairo_500Medium",
    fontSize: type.caption.fontSize,
    lineHeight: bodyLine(type.caption.fontSize),
    textAlign: "center",
  },
  labelActive: { fontFamily: "Cairo_700Bold" },
});
