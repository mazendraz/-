import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import type { ServiceCategory } from "../lib/catalog";
import Icon from "./Icon";

export interface CategorySelection {
  slug: string;
  label: string;
  pricingMode?: "QUOTE_ONLY" | "FIXED_CATALOG";
  isPrimary: boolean;
}

/**
 * Searchable multi-select for a company's categories, with selected categories
 * shown as removable chips (one marked primary via the star toggle). A company
 * may belong to several categories at once (e.g. Interior Finishing AND
 * Landscaping) — the primary one is what every single-value display spot on the
 * site (card badge, featured-project card, search result label) shows.
 *
 * Removing the current primary auto-promotes the first remaining chip, and the
 * last chip can't be removed — both mirror the server-side invariants (a
 * company always has exactly one primary and at least one category) so the
 * form can never be saved into a state the API would reject.
 */
export default function CategoryMultiSelect({ categories, selected, onChange, max, disabled }: {
  categories: ServiceCategory[]; // full option list to search/pick from
  selected: CategorySelection[]; // current selection, in the order added
  onChange: (next: CategorySelection[]) => void;
  max?: number; // no limit unless provided
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedSlugs = useMemo(() => new Set(selected.map((s) => s.slug)), [selected]);
  const atMax = typeof max === "number" && selected.length >= max;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => !selectedSlugs.has(c.slug))
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [categories, query, selectedSlugs]);

  function add(cat: ServiceCategory) {
    if (disabled || atMax) return;
    onChange([
      ...selected,
      { slug: cat.slug, label: cat.label, pricingMode: cat.pricingMode, isPrimary: selected.length === 0 },
    ]);
    setQuery("");
  }

  function remove(slug: string) {
    if (disabled || selected.length <= 1) return; // must keep at least one
    const wasPrimary = selected.find((s) => s.slug === slug)?.isPrimary ?? false;
    const rest = selected.filter((s) => s.slug !== slug);
    if (wasPrimary && rest.length > 0) rest[0] = { ...rest[0], isPrimary: true };
    onChange(rest);
  }

  function setPrimary(slug: string) {
    if (disabled) return;
    onChange(selected.map((s) => ({ ...s, isPrimary: s.slug === slug })));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.slug}
              className={`flex items-center gap-1 ps-1.5 pe-2.5 py-1 rounded-full text-caption font-bold ${
                s.isPrimary ? "bg-primary/12 text-primary" : "bg-surface-container text-on-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => setPrimary(s.slug)}
                disabled={disabled}
                title={t(locale, "admin_ce_categories_primary_hint")}
                className={`flex items-center p-0.5 rounded-full transition-colors ${
                  s.isPrimary ? "text-primary" : "text-outline hover:text-primary"
                }`}
              >
                <Icon name="star" className="text-label" style={{ fontVariationSettings: s.isPrimary ? "'FILL' 1" : "'FILL' 0" }} />
              </button>
              {s.label}
              {selected.length > 1 && (
                <button type="button" onClick={() => remove(s.slug)} disabled={disabled} className="hover:text-error transition-colors">
                  <Icon name="close" className="text-label" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <div className="relative">
          <div className="relative">
            <Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline text-label pointer-events-none" />
            <input
              className="field-input ps-9"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              placeholder={atMax ? t(locale, "admin_ce_categories_max_reached") : t(locale, "admin_ce_categories_search_ph")}
              disabled={atMax}
            />
          </div>
          {open && !atMax && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-bloom">
              {matches.length === 0 ? (
                <p className="px-3 py-2 text-caption text-outline">{t(locale, "admin_ce_categories_no_match")}</p>
              ) : (
                matches.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(c)}
                    className="w-full text-start px-3 py-2 text-label text-on-surface hover:bg-surface-container transition-colors"
                  >
                    {c.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
