/**
 * Font loading — Cairo (body) and Alexandria (display), matching the
 * website's font-family choices in tailwind.config.js exactly (Cairo for
 * `sans`, Alexandria for `display`).
 *
 * Plus Jakarta Sans and Inter — the website's OTHER two faces — are Latin-only
 * and were paired with an Arabic fallback there for the rare Latin string. This
 * app is Arabic-first with RTL forced (see lib/rtl.ts), so only the Arabic
 * pair is loaded; adding the Latin pair back is a one-line change here if an
 * English UI ever ships, not a redesign.
 */
import {
  useFonts,
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from "@expo-google-fonts/cairo";
import {
  Alexandria_600SemiBold,
  Alexandria_700Bold,
  Alexandria_800ExtraBold,
} from "@expo-google-fonts/alexandria";

export const fonts = {
  body: "Cairo_400Regular",
  bodyMedium: "Cairo_500Medium",
  bodySemiBold: "Cairo_600SemiBold",
  bodyBold: "Cairo_700Bold",
  display: "Alexandria_600SemiBold",
  displayBold: "Alexandria_700Bold",
  displayExtraBold: "Alexandria_800ExtraBold",
} as const;

/**
 * Ready to render — either the real fonts loaded, or loading them FAILED and
 * there's nothing left to wait for. app/_layout.tsx gates the entire app's
 * first paint on this (`if (!fontsLoaded) return null`), and `useFonts`
 * returns `[loaded, error]`: reading only `loaded` meant a load failure —
 * no network, a corrupted cache, anything `expo-font` itself throws on —
 * left `loaded` false forever, with no error path and no fallback, so the
 * splash screen never hid. Text in a system font for the rare case that
 * happens is a far better outcome than an app that never starts.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Alexandria_600SemiBold,
    Alexandria_700Bold,
    Alexandria_800ExtraBold,
  });
  return loaded || Boolean(error);
}
