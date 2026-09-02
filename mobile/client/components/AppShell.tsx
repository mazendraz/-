import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import TabBar from "./TabBar";
import { isFullScreenRoute } from "../lib/navShell";

/**
 * The persistent application shell.
 *
 * ── The architecture, and what it replaces ─────────────────────────────────
 * Before: the root <Stack> was the whole app, and the bottom bar was drawn by
 * the tab navigator INSIDE it — one screen of that stack. Every internal
 * route (`/services`, `/services/[slug]`, `/company/[slug]`, `/search`,
 * `/chat/[leadId]`, `/new-request/[slug]`, `/notifications`, `/legal/[kind]`)
 * is a SIBLING of the `(tabs)` group, so pushing any of them covered the tab
 * navigator completely — and the bar, being the navigator's own furniture,
 * went with it. Nothing was conditionally hiding it; it simply was not on
 * screen any more. That is the root cause of "the bar vanishes as soon as I
 * go one level deep".
 *
 * After:
 *
 *     AppShell                       ← this file, mounted once at the root
 *     ├── content                    ← the whole <Stack>, flex: 1
 *     │     └── (tabs) │ services │ company │ chat │ …
 *     └── <TabBar/>                  ← one instance, outside the navigator
 *
 * The bar is a SIBLING of the navigator, laid out in a column, so it is
 * neither covered by a push nor overlapping anything: every screen simply
 * gets a viewport that ends where the bar begins. That is also why no screen
 * needed padding added for it — there is nothing to pad around, and no second
 * safe-area implementation (the bar keeps using the same
 * `useSafeAreaInsets()` it always did, off the one SafeAreaProvider in
 * app/_layout.tsx).
 *
 * The navigation stack itself is untouched: pushes still push, `router.back()`
 * and the Android hardware back button still pop, and the tab navigator still
 * keeps its five screens mounted, so switching tabs preserves each one's
 * state exactly as before.
 *
 * ── When the chrome is allowed to go ───────────────────────────────────────
 * Only two reasons, both deliberate:
 *   1. The route is one of lib/navShell.ts's explicitly-listed full-screen
 *      experiences (auth, the guided-start wizard). Never "because this route
 *      is not one of the five tabs" — that was the old behaviour and it is
 *      the bug.
 *   2. Android has the keyboard open. The window is resized there
 *      (softwareKeyboardLayoutMode defaults to "resize"), so a bar left in
 *      place would sit on top of the keyboard — this is the same thing
 *      react-navigation's own `tabBarHideOnKeyboard` does, and it is Android
 *      only for the same reason: iOS overlays the keyboard without resizing,
 *      so the bar is simply behind it and needs no help.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const keyboardUp = useAndroidKeyboard();

  const showChrome = !isFullScreenRoute(pathname) && !keyboardUp;

  return (
    <View style={styles.shell}>
      <View style={styles.content}>{children}</View>
      {showChrome && <TabBar />}
    </View>
  );
}

/** True while the soft keyboard is up on Android — always false elsewhere. */
function useAndroidKeyboard(): boolean {
  const [up, setUp] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setUp(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return up;
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  // The navigator gets everything the bar does not. No `overflow` and no
  // `position` of its own: a native stack needs a plain flex box to measure
  // its screens against, and giving it anything else is what turns push
  // animations into flicker.
  content: { flex: 1 },
});
