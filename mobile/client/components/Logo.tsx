import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { useSettings } from "../lib/settings";
import { assetUri } from "../lib/assetUrl";

// The site's actual default mark (app/public/logo.png on the website),
// bundled into the binary — matches the website's own `src={logo_url ||
// "/logo.png"}` fallback exactly. Previously this fell back to a plain
// "العاصمة" text wordmark instead, which the website never does; a mid-load
// or never-configured customer saw a rendered word where the website always
// shows the real mark.
const DEFAULT_LOGO = require("../assets/logo-default.png");

// Measured directly from the file (1000×1000 canvas, visible mark ~890×876)
// — NOT the website's separate 612×408 export, which is a different file.
// `Image.resolveAssetSource` would normally read this from Metro at build
// time, but it isn't available as a function in this Expo/RNW version, so
// this is a plain measured constant instead of a runtime lookup.
const DEFAULT_LOGO_ASPECT = 890 / 876;

/**
 * Brand logo — the mobile counterpart of the website's Logo.tsx. Reads the
 * admin-uploaded logo_url from platform settings at runtime, so a branding
 * change made from the dashboard shows up without a new build. Falls back to
 * the bundled default mark above while settings are loading or if no logo
 * was ever uploaded — never a text placeholder.
 *
 * The website sizes its logo by height only and lets the width follow the
 * image's own aspect ratio (`height: "44px", width: "auto"`). This used to
 * force the mark into a `size`×`size` SQUARE box instead — for a rectangular
 * 1.5-aspect mark, `resizeMode="contain"` then had to shrink it to ~2/3 of
 * the requested height to avoid distorting it, which is exactly why the
 * wordmark read as illegible/tiny. Sizing by height + the real aspect ratio
 * (looked up for admin-uploaded marks via `Image.getSize`, known up front
 * for the bundled default) renders the SAME logo file at its true shape, as
 * large as the requested height allows, with no empty letterboxing.
 *
 * `size` is the height the mark renders at (large on sign-in, small in a tab
 * header). `logo_scale` — admin-tunable, 50–200% — is applied as a transform
 * on top of that, same as the website's Logo.
 */
export default function Logo({ size = 40 }: { size?: number }) {
  const { logo_url, logo_scale } = useSettings();
  const source = logo_url ? { uri: assetUri(logo_url) } : DEFAULT_LOGO;

  const [aspect, setAspect] = useState(DEFAULT_LOGO_ASPECT);

  useEffect(() => {
    if (!logo_url) {
      setAspect(DEFAULT_LOGO_ASPECT);
      return;
    }
    let alive = true;
    // expo-image has no getSize(uri, cb) static (RN Image's own API) — its
    // equivalent is loadAsync, which decodes through the SAME native pipeline
    // the rendered <Image> below uses, so an admin-uploaded WebP logo (every
    // upload goes through sharp's .webp() — see upload.service.ts) reports
    // its real dimensions instead of silently failing the way RN's decoder
    // would have on iOS, which has no built-in WebP support.
    Image.loadAsync(logo_url)
      .then((ref) => { if (alive && ref.height > 0) setAspect(ref.width / ref.height); })
      .catch(() => { if (alive) setAspect(DEFAULT_LOGO_ASPECT); });
    return () => { alive = false; };
  }, [logo_url]);

  const scale = Number(logo_scale);
  const clamped = Number.isFinite(scale) && scale > 0 ? Math.min(Math.max(scale, 50), 200) : 100;
  const transform = clamped !== 100 ? [{ scale: clamped / 100 }] : undefined;

  return (
    <Image
      source={source}
      style={[{ height: size, width: size * aspect, alignSelf: "center" }, transform ? { transform } : null]}
      contentFit="contain"
    />
  );
}
