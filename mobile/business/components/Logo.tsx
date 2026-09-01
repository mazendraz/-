import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { useSettings, assetUri } from "@alassema/mobile-shared";

// The site's actual default mark (app/public/logo.png on the website, also
// mobile/client/assets/logo-default.png) — bundled into this app's own
// binary too. This app previously showed a plain "العاصمة" text wordmark on
// sign-in/offline/maintenance/update-required instead — the one thing
// neither the website nor the client app ever does; see this component's
// client-app counterpart for the original fix and reasoning.
const DEFAULT_LOGO = require("../assets/logo-default.png");

// Measured directly from the file (1000×1000 canvas, visible mark ~890×876)
// — same source file as the client app's copy, same measured aspect.
const DEFAULT_LOGO_ASPECT = 890 / 876;

/**
 * Brand logo — the Business App's counterpart of mobile/client's
 * components/Logo.tsx (see that file for the full reasoning on sizing by
 * height + real aspect ratio rather than forcing a square box). Reads the
 * admin-uploaded logo_url from platform settings (GET /settings, public —
 * reachable even pre-sign-in) via @alassema/mobile-shared's useSettings, so
 * a branding change made from the dashboard shows up without a new build.
 * Falls back to the bundled default mark while settings are loading or if
 * no logo was ever uploaded — never a text placeholder.
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
