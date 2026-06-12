import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Locale } from "../lib/i18n";

const LOCALE_KEY = "al-assema-locale";

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  isRTL: boolean;
}

const LocaleContext = createContext<LocaleCtx>({
  locale: "en",
  setLocale: () => {},
  isRTL: false,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try { return (localStorage.getItem(LOCALE_KEY) as Locale) ?? "en"; }
    catch { return "en"; }
  });

  const isRTL = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    localStorage.setItem(LOCALE_KEY, locale);
  }, [locale, isRTL]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale: setLocaleState, isRTL }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
