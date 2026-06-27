import { useSettings } from "../lib/settings";

// Brand logo. Uses the admin-uploaded logo (Settings → branding) when set, else
// the built-in /logo.png. Reactive — updates when settings hydrate/change.
export default function Logo({
  className = "",
  alt,
  style,
}: {
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const { logo_url, site_name, logo_scale } = useSettings();
  // Admin-tunable size: a percentage (blank = 100). Applied as a transform so it
  // scales the logo within its layout box without shifting surrounding elements.
  const scale = Number(logo_scale);
  const clamped = Number.isFinite(scale) && scale > 0 ? Math.min(Math.max(scale, 50), 200) : 100;
  const transform = clamped !== 100 ? `scale(${clamped / 100})` : undefined;
  return (
    <img
      src={logo_url || "/logo.png"}
      alt={alt ?? site_name ?? "Logo"}
      className={className}
      style={transform ? { ...style, transform } : style}
      loading="eager"
      decoding="async"
    />
  );
}
