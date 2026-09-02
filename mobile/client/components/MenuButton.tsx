import { Pressable, type ColorValue } from "react-native";
import { colors } from "@alassema/core";
import Icon from "./Icon";
import { openAppMenu } from "../lib/appMenu";
import { isFullScreenRoute } from "../lib/navShell";
import { usePathname } from "expo-router";

/**
 * The hamburger — the one trigger for the app-wide menu.
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 * A hand-rolled Pressable + <Icon name="menu"> + a local `menuOpen` useState +
 * its own <MenuModal>, all living inside app/company/[slug].tsx. That was the
 * only screen in the app that had a menu at all, which is why the menu
 * "disappeared" the moment you navigated anywhere else — there was nothing to
 * disappear from. The modal now lives once at the root (app/_layout.tsx) and
 * this only flips the shared store in lib/appMenu.ts.
 *
 * ── Why a button per header rather than one floating button ────────────────
 * Every screen in this app draws its OWN header, and they are deliberately
 * different — transparent over a cover photo on a company profile, a plain
 * title row on a category, an absolutely-centred logo on Home — with
 * different heights and different top padding. A single shell-owned button
 * pinned to the corner would land a few pixels off on most of them, which is
 * a visual regression. So the shell owns the menu (state + modal + this
 * component) and each existing header just places it, the same way a
 * navigator's `headerRight` would. There is one implementation, not one per
 * screen.
 *
 * `color` because the company profile's header sits over a photo and its
 * icons are white there until the header goes solid on scroll.
 */
export default function MenuButton({
  color = colors.onSurface,
  size = 24,
}: {
  color?: ColorValue;
  size?: number;
}) {
  const pathname = usePathname();

  // The same rule the bottom bar follows, so the two halves of the global
  // chrome can never disagree about whether a screen is full-screen.
  if (isFullScreenRoute(pathname)) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="القائمة"
      onPress={openAppMenu}
      hitSlop={8}
    >
      <Icon name="menu" size={size} color={color} />
    </Pressable>
  );
}
