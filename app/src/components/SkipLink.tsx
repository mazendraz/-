import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

/**
 * Visually hidden until focused — the very first Tab stop on every layout
 * (RootLayout, admin, provider), jumping straight to <main id="main">.
 * WCAG 2.4.1 (Bypass Blocks).
 */
export default function SkipLink() {
  const { locale } = useLocale();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[200] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2.5 focus:rounded-xl focus:font-bold focus:text-label focus:shadow-2xl"
    >
      {t(locale, "a11y_skip_to_content")}
    </a>
  );
}
