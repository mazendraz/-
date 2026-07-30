import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

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
      <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-outline text-[20px] pointer-events-none">search</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        className="w-full ps-10 pe-9 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-[14px] placeholder:text-outline/70 focus:ring-2 focus:ring-primary/25 focus:border-primary focus:outline-none transition-all"
        style={{ fontSize: "16px" }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-surface-container transition-colors"
          aria-label={t(locale, "search_clear")}
        >
          <span className="material-symbols-outlined text-outline text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}
