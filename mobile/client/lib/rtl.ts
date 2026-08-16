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
 */
import { I18nManager } from "react-native";

export function ensureRTL(): void {
  if (I18nManager.isRTL) return;
  // allowRTL must be true for forceRTL to take effect at all.
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  // No auto-reload here: Expo Go / dev builds will pick it up on the next
  // Fast Refresh anyway, and a silent forced reload on first launch is a worse
  // experience than one manual restart during setup.
}
