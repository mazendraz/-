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

/**
 * ── Why Arabic set in Alexandria needs an explicit lineHeight ───────────────
 *
 * A React Native <Text> is drawn inside its own layout box and CLIPPED to it
 * (RCTParagraphComponentView's drawRect draws into the view's bounds), and the
 * height of that box comes from the font's declared metrics — not from how far
 * its glyphs actually reach.
 *
 * Alexandria's declared descent is 0.251em, but its Arabic glyphs descend far
 * past that: ج reaches -0.392em, and the isolated ي -0.536em (measured from
 * the shipped Alexandria_800ExtraBold.ttf's glyf table). So the tail of every
 * one of those letters was drawn BELOW the box that clips it and simply
 * disappeared — the "1000 ج with the ج cut off" on every price, and the same
 * silent trim on every Alexandria heading that ends in ي. Cairo does not have
 * this problem (it declares a 0.571em descent against 0.462em of ink), which
 * is why only the display face shows it.
 *
 * Setting `lineHeight` fixes it because RN vertically CENTRES text inside a
 * lineHeight larger than the font's own (it adds a baseline offset of
 * `(lineHeight - fontLineHeight) / 2`, see RCTAttributedTextUtils.mm), so half
 * the extra space lands below the baseline. The room below then becomes
 * `0.251em + (ratio - 1.219em) / 2`, and covering 0.536em of ink needs a ratio
 * of 1.79. Rounded up to 1.8 for margin — which is generous leading for Arabic
 * anyway, not merely a workaround.
 *
 * Cairo text does NOT need this; it has its own (tighter) line heights in
 * `type`. This is only for the display face.
 */
export const DISPLAY_LINE_RATIO = 1.8;

/** `lineHeight` for a run of Arabic set in Alexandria — see DISPLAY_LINE_RATIO. */
export function displayLine(fontSize: number): number {
  return Math.round(fontSize * DISPLAY_LINE_RATIO);
}

/**
 * ── Why Arabic set in CAIRO also needs a lineHeight FLOOR ───────────────────
 *
 * The note above is about Alexandria's under-declared descent. Cairo has the
 * opposite problem, and it bites through a different door.
 *
 * Cairo's own metrics are honest: it declares a 0.571em descent against a
 * deepest Arabic ink of 0.462em (Cairo_700Bold — measured across the shipped
 * 400/500/600/700 .ttf glyf tables, the four weights fonts.ts loads). So text
 * with NO `lineHeight` never clips: Yoga uses the font's natural line box of
 * ascent+descent = 1.303 + 0.571 = 1.874em, and the ink fits inside it with
 * room to spare.
 *
 * The clipping starts the moment a lineHeight SMALLER than that 1.874em is
 * set — and `type` in @alassema/core sets exactly that at every step, because
 * it was extracted from the website's tailwind.config.js. On the web a tight
 * `line-height` is harmless: CSS lets a glyph paint outside its line box. In
 * React Native the <Text> is CLIPPED to its box (the same mechanism the
 * Alexandria note above describes), so the web's 12/16, 13/18, 15/22 pairs
 * slice the bottom off every ب, ج, ل and ي.
 *
 * Same centring rule as before — RN splits the difference between the
 * requested lineHeight and the font's own, so the room below the baseline is
 * `descent + (ratio - 1.874em) / 2`. Covering 0.462em of ink therefore needs
 *
 *     ratio >= 1.874 + 2 * (0.462 - 0.571) = 1.656em
 *
 * Rounded up to 1.7 for margin. Note this is SMALLER than Alexandria's 1.8:
 * the two faces need different floors, which is why they get two helpers
 * rather than one shared number.
 *
 * This is a FLOOR, not a replacement type scale. `fontSize` is never touched
 * — the design's type scale is unchanged — and call sites that already chose
 * a more generous leading than the floor keep it.
 */
export const BODY_LINE_RATIO = 1.7;

/** Smallest `lineHeight` that will not clip Arabic ink set in Cairo at this
 *  size — see BODY_LINE_RATIO. Pass a `preferred` value to keep a deliberately
 *  roomier leading: the floor only ever raises it, never tightens it. */
export function bodyLine(fontSize: number, preferred?: number): number {
  return Math.max(preferred ?? 0, Math.round(fontSize * BODY_LINE_RATIO));
}
