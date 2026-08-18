import { Image } from "react-native";
import { useSettings } from "../lib/settings";

// The site's actual default mark (app/public/logo.png on the website),
// bundled into the binary — matches the website's own `src={logo_url ||
// "/logo.png"}` fallback exactly. Previously this fell back to a plain
// "العاصمة" text wordmark instead, which the website never does; a mid-load
// or never-configured customer saw a rendered word where the website always
// shows the real mark.
const DEFAULT_LOGO = require("../assets/logo-default.png");

/**
 * Brand logo — the mobile counterpart of the website's Logo.tsx. Reads the
 * admin-uploaded logo_url from platform settings at runtime, so a branding
 * change made from the dashboard shows up without a new build. Falls back to
 * the bundled default mark above while settings are loading or if no logo
 * was ever uploaded — never a text placeholder.
 *
 * `size` is the square box the mark renders into (large on sign-in, small in
 * a tab header). `logo_scale` — admin-tunable, 50–200% — is applied as a
 * transform on top of that, same as the website's Logo.
 */
export default function Logo({ size = 40 }: { size?: number }) {
  const { logo_url, logo_scale } = useSettings();

  const scale = Number(logo_scale);
  const clamped = Number.isFinite(scale) && scale > 0 ? Math.min(Math.max(scale, 50), 200) : 100;
  const transform = clamped !== 100 ? [{ scale: clamped / 100 }] : undefined;

  return (
    <Image
      source={logo_url ? { uri: logo_url } : DEFAULT_LOGO}
      style={[{ width: size, height: size, alignSelf: "center" }, transform ? { transform } : null]}
      resizeMode="contain"
    />
  );
}
