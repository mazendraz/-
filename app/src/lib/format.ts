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
 * I18N-04: plain "ar-EG" renders Arabic-Indic digits (٢٩ يوليو ٢٠٢٦), which
 * used to disagree with pricing.ts's money formatting ("ar-EG-u-nu-latn" →
 * Latin digits, "12,000 ج"). Mazen picked one rule for the whole product:
 * Latin digits everywhere, Arabic or not — matches how Egyptian
 * e-commerce/services apps commonly render numerals even inside Arabic text.
 * The `-u-nu-latn` Unicode extension forces that numbering system.
 */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-US";
}

/** General-purpose number formatting (counts, ratings, percentages) — the
 * same Latin-digit rule as dates and money, so a count next to a date next to
 * a price never disagrees on numeral style. */
export function formatNumber(locale: Locale, n: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(n);
}

/**
 * A star rating, for display. ONE decimal, always.
 *
 * Stored precision and displayed precision are different things, and conflating
 * them is what put `★ 4.666666666666667` on a company card. `Company.rating` is a
 * Float: the review recompute rounds it to one decimal, but an admin's manual
 * override wrote whatever number it was given, and every render site printed the
 * raw value with `{c.rating}`.
 *
 * Fixing only the write path would leave existing rows broken; fixing only the
 * read path would let new ones drift. Both are fixed — this is the read half, and
 * it is the one that guarantees no rating can ever render long, whatever is in
 * the column.
 *
 * Trailing zeros are kept (4.0, not 4) so a column of ratings stays aligned.
 */
export function formatRating(locale: Locale, rating: number): string {
  if (!Number.isFinite(rating)) return "—";
  const clamped = Math.min(5, Math.max(0, rating));
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(clamped);
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
