// I18N-02: Arabic has SIX plural categories (zero, one, two, few, many,
// other) — CLDR rules, not the two (singular/plural) every counter in this
// product was built for (`count === 1 ? singular : plural`). "2 شركات" is
// wrong Arabic (needs the dual "شركتين"); "11 شركات" is wrong too (11-99
// takes the singular tamyiz form "11 شركة", not the sound plural). English
// only ever needs "one"/"other", so this only visibly changes Arabic.
import type { Locale } from "./locale";

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

const RULES: Record<Locale, Intl.PluralRules> = {
  ar: new Intl.PluralRules("ar"),
  en: new Intl.PluralRules("en"),
};

export function pluralCategory(locale: Locale, n: number): PluralCategory {
  return RULES[locale].select(n) as PluralCategory;
}

/**
 * A noun's forms for every category CLDR defines for a locale. Only `other`
 * is required — every category not supplied falls back to it, which is
 * exactly right for English ("other" already covers 0, 2, 3, 11, 100 — only
 * "one" ever differs there).
 *
 * For Arabic, "zero" and "few" share the plural-noun form in practice (a UI
 * rarely renders "0 X" distinctly from "3 X" — both read as "N شركات"), and
 * "many" (11-99) and "other" (100+) share the singular tamyiz form ("11
 * شركة" / "100 شركة") — so most concepts only need `one`/`two`/`few`/`other`
 * written out, not all six.
 */
export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };

export function selectPlural(locale: Locale, n: number, forms: PluralForms): string {
  return forms[pluralCategory(locale, n)] ?? forms.other;
}
