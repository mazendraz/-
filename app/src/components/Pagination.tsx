import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  /**
   * Singular and plural noun for the count label, ALREADY TRANSLATED by the
   * caller — e.g. t(locale, "admin_noun_lead") / t(locale, "admin_noun_leads").
   * Both are required: the old `noun + "s"` default only worked in English and
   * put untranslated words on Arabic screens.
   */
  noun: string;
  nounPlural: string;
  className?: string;
}

/**
 * Compact pager for server-paginated lists (pairs with useServerSearch). Shows the
 * current slice ("21–40 of 312 leads") plus Prev/Next. Hidden when there's a single
 * page and nothing to show. RTL-safe (uses logical chevrons via rotation-free icons).
 */
export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  noun,
  nounPlural,
  className = "",
}: Props) {
  const { locale } = useLocale();
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const plural = total === 1 ? noun : nounPlural;

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap ${className}`}>
      <p className="text-[13px] text-outline">
        <span className="font-bold text-on-surface">{from}–{to}</span> {t(locale, "pagination_of")}{" "}
        <span className="font-bold text-on-surface">{total}</span> {plural}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-bold text-on-surface bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label={t(locale, "pagination_prev")}
          >
            <span className="material-symbols-outlined text-[18px] rtl:rotate-180">chevron_left</span>
          </button>
          <span className="text-[13px] text-outline px-1 tabular-nums">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-bold text-on-surface bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label={t(locale, "pagination_next")}
          >
            <span className="material-symbols-outlined text-[18px] rtl:rotate-180">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
