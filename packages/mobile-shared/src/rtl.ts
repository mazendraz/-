/**
 * RTL setup — must run before any component renders.
 *
 * Unlike the web (where `dir="rtl"` on <html> takes effect immediately),
 * React Native's I18nManager requires an app RESTART for a forced RTL change
 * to apply to layout. Getting this wrong is a classic Expo gotcha: call
 * forceRTL() after the app has already mounted, and half the screen mirrors
 * while the other half doesn't, until the user force-quits.
 *
 * The product is Arabic-only today (matching index.html's `dir="rtl"` on the
 * website), so RTL is forced unconditionally at module load — before
 * `expo-router`'s entry point ever mounts a screen — rather than deferred to
 * a locale toggle that doesn't exist yet. When English support is added, this
 * becomes a real "did the setting change since last launch" check with a
 * restart prompt, not a bigger version of this file.
 *
 * ── The reload this needs, in a REAL build ──────────────────────────────────
 * A fresh install's first launch used to run one full session with the
 * native layout engine still LTR — I18nManager.forceRTL() above persists the
 * preference immediately, but Yoga only reads it once, at process start, so
 * the change is invisible until the NEXT cold start. In development that was
 * masked by Fast Refresh re-evaluating this module on every edit; a shipped
 * build has no Fast Refresh, so every fresh install got one genuinely
 * mirrored, wrong-direction session with no explanation before it
 * self-corrected on the second open.
 *
 * `Updates.reloadAsync()` (expo-updates) reloads the JS bundle in place,
 * without relaunching the native process — exactly the "restart" the native
 * layer needs, and unlike RN's dev-only `DevSettings.reload()`, it works in a
 * release build (that is the whole reason this module now depends on
 * expo-updates rather than nothing). Firing it here, before
 * SplashScreen.preventAutoHideAsync() even runs below, means the reload
 * happens while the OS's own native splash is still covering the screen —
 * the customer never sees the wrong-direction frame it replaces.
 */
import { I18nManager } from "react-native";
import * as Updates from "expo-updates";

export function ensureRTL(): void {
  if (I18nManager.isRTL) return;
  // allowRTL must be true for forceRTL to take effect at all.
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);

  // isEnabled is false in Expo Go / a dev client / `expo start` with no EAS
  // Update configured — reloadAsync() rejects outright in all of those, so
  // this is what keeps local development on its existing "Fast Refresh
  // picks it up" behavior instead of erroring on every cold start. The
  // .catch is a second backstop for the same rejection in an environment
  // isEnabled didn't already catch (see reloadAsync's own doc comment) —
  // fire-and-forget either way, since there is nothing more useful to do
  // with a failed reload than let this one session render LTR as before.
  if (Updates.isEnabled) {
    void Updates.reloadAsync().catch(() => {});
  }
}

/**
 * ── Writing direction, as the LAYOUT actually sees it ────────────────────────
 *
 * `ensureRTL()` above only reaches the NATIVE engine. On react-native-web
 * `I18nManager.forceRTL` is a no-op stub whose `isRTL` is hardcoded to false
 * (node_modules/react-native-web/dist/exports/I18nManager), and this app ships
 * no `+html.tsx` setting `dir="rtl"` on the document — so in a browser the
 * layout engine is LTR no matter what this module does.
 *
 * That matters because Yoga SWAPS row and row-reverse under an RTL engine:
 * `row` lays children right-to-left and `row-reverse` lays them left-to-right.
 * So the `flexDirection: "row-reverse"` written all over this app produces a
 * right-to-left row on web (engine LTR) and a LEFT-to-right one on a phone
 * that has restarted since forceRTL took effect. One hardcoded value cannot be
 * right in both places.
 *
 * These three constants are that single source of truth. They are computed
 * once at module load, which is safe: `I18nManager.isRTL` cannot change during
 * a session — changing it is precisely what requires the restart described
 * above.
 */

/** Does the UI read right-to-left? Arabic-only product today; when locale
 *  switching lands this becomes a read of the chosen locale, and everything
 *  built on it follows without a second edit. */
export const uiIsRTL = true;

/** `flexDirection` laying children from the UI's START edge to its END —
 *  correct under either engine, unlike a hardcoded "row-reverse". */
export const rowStart: "row" | "row-reverse" = I18nManager.isRTL === uiIsRTL ? "row" : "row-reverse";

/** `textAlign` hugging the start edge. left/right are PHYSICAL in both engines
 *  (unlike flexDirection), so this needs no isRTL term — only the UI's own
 *  direction. */
export const textStart: "left" | "right" = uiIsRTL ? "right" : "left";

/**
 * `flexDirection` laying children END → START — the mirror of `rowStart`, for
 * the handful of rows whose order is PHYSICAL rather than linguistic: a phone
 * number's dial code and its digits (the website spells that same row
 * `dir="ltr"`, see PhoneInput.tsx), a "N / total" counter, a row of stars.
 * Hardcoding `"row"` for those is the same trap `rowStart` exists to close —
 * it means left-to-right only while the engine is LTR, and silently flips on a
 * phone that has restarted since forceRTL took effect.
 */
export const rowLtr: "row" | "row-reverse" = I18nManager.isRTL ? "row-reverse" : "row";

/**
 * Is the LAYOUT ENGINE itself right-to-left right now? Not the same question
 * as `uiIsRTL` (which is about the language) — on react-native-web these two
 * disagree, which is exactly why `rowStart` needs both.
 *
 * Needed wherever a PHYSICAL measurement has to be read back or written: a
 * horizontal ScrollView's `contentOffset.x` is measured from the left edge in
 * both engines, but under an RTL engine item 0 sits at the RIGHT, so deriving
 * a page index from it without this constant gets the mirror image of the
 * page the customer is actually looking at (see MediaLightbox.tsx).
 */
export const engineIsRTL: boolean = I18nManager.isRTL;
