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

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Alexandria_600SemiBold,
    Alexandria_700Bold,
    Alexandria_800ExtraBold,
  });
  return loaded;
}
