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
  const { logo_url, site_name } = useSettings();
  return (
    <img
      src={logo_url || "/logo.png"}
      alt={alt ?? site_name ?? "Logo"}
      className={className}
      style={style}
      loading="eager"
      decoding="async"
    />
  );
}
