import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "./Icon";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/** Consistent search box used across admin + public lists. */
export default function SearchInput({ value, onChange, placeholder, className = "" }: Props) {
  const { locale } = useLocale();
  // Default resolved here, not in the signature, so it follows the site language
  // instead of being frozen to English at the call site.
  const ph = placeholder ?? t(locale, "search_placeholder");
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline text-title pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        aria-label={ph}
        // DM-06: py-2.5 measured 40px. This box appears on nearly every list
        // screen in both dashboards and the public site, so it was one of the
        // most-repeated undersized targets in the app.
        className="w-full ps-10 pe-9 py-2.5 min-h-[44px] rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-label placeholder:text-outline focus:ring-2 focus:ring-primary/25 focus:border-primary focus:outline-none transition"
        style={{ fontSize: "16px" }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute end-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
          aria-label={t(locale, "search_clear")}
        >
          <Icon name="close" className="text-outline text-subhead" />
        </button>
      )}
    </div>
  );
}
