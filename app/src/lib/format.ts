// Locale-aware formatting for dates and times.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// `new Date(x).toLocaleDateString()` with no argument uses the BROWSER's locale,
// not the site's. A visitor on an English Windows install reading the Arabic site
// was getting "Jul 29, 2026" inside an otherwise Arabic screen. The site language
// is a user choice; the OS language is not.
//
// So: never call toLocaleDateString/toLocaleString directly in a component. Call
// these, pass the `locale` from useLocale(), and the two always agree. A guard
// test (i18n.coverage.test.ts) fails the build on direct calls.
//
// pricing.ts already does this for money — same approach, same reason.
import type { Locale } from "./i18n";

/**
 * BCP-47 tag for a site locale, for DATES.
 *
 * ⚠ Plain "ar-EG" → Arabic-Indic digits (٢٩ يوليو ٢٠٢٦). That is exactly what
 * every date call did before this refactor, and this pass is a text move with no
 * behaviour change, so it is preserved verbatim.
 *
 * Note it disagrees with pricing.ts, which formats MONEY with
 * "ar-EG-u-nu-latn" (Latin digits: 12,000 ج). So Arabic screens currently show
 * Latin digits for money and Arabic-Indic digits for dates. That inconsistency
 * predates this change and is left alone deliberately — picking one is a product
 * decision, not a refactor. It is on the findings list for Mazen.
 */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG" : "en-US";
}

/** Short date: "29 Jul 2026" / "٢٩ يوليو ٢٠٢٦" (Latin digits). */
export function formatDate(epochMs: number, locale: Locale): string {
  return new Date(epochMs).toLocaleDateString(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Date + time, for audit-style rows where the hour matters. */
export function formatDateTime(epochMs: number, locale: Locale): string {
  return new Date(epochMs).toLocaleString(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
