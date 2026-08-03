import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { Locale } from "../lib/i18n";

const LOCALE_KEY = "al-assema-locale";

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  isRTL: boolean;
}

const LocaleContext = createContext<LocaleCtx>({
  locale: "ar",
  setLocale: () => {},
  isRTL: true,
});

// I18N-06: a shared link or a search engine following a `hreflang` alternate
// carries `?lang=` — it must win over whatever THIS device saved before,
// otherwise the visitor lands on the language their last visit picked, not
// the one the link promised. Mirrored in public/locale-init.js, which reads
// the same param before React hydrates so there's no RTL/LTR flash either.
function initialLocale(): Locale {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl === "ar" || fromUrl === "en") return fromUrl;
    return (localStorage.getItem(LOCALE_KEY) as Locale) ?? "ar";
  } catch {
    return "ar";
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();

  const isRTL = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    localStorage.setItem(LOCALE_KEY, locale);
  }, [locale, isRTL]);

  // Keep `?lang=` in the visible URL on every page, not just the instant
  // after a toggle — an in-app <Link> navigation doesn't carry query params
  // over, so without re-checking on every route change a page two clicks
  // deep would silently lose the language from its own URL again. Uses the
  // router's own history (not window.history directly), so back/forward and
  // <ScrollRestoration /> stay in sync with what's actually on screen.
  useEffect(() => {
    if (searchParams.get("lang") !== locale) {
      const next = new URLSearchParams(searchParams);
      next.set("lang", locale);
      setSearchParams(next, { replace: true });
    }
  }, [locale, pathname, searchParams, setSearchParams]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale: setLocaleState, isRTL }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
