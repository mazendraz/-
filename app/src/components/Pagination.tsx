import { useLocale } from "../context/LocaleContext";
import { t, tCount, type PluralKey } from "../lib/i18n";
import Icon from "./Icon";

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  /**
   * I18N-02: was two already-translated strings (`noun`/`nounPlural`) picked
   * by `total === 1 ? noun : nounPlural` — only ever right for English. One
   * plural-set key instead, resolved via `tCount` against all six Arabic
   * CLDR categories ("2 X" needs the dual, "11 X" the singular tamyiz form).
   */
  nounKey: PluralKey;
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
  nounKey,
  className = "",
}: Props) {
  const { locale } = useLocale();
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const plural = tCount(locale, nounKey, total);

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap ${className}`}>
      <p className="text-label text-outline">
        <span className="font-bold text-on-surface">{from}–{to}</span> {t(locale, "pagination_of")}{" "}
        <span className="font-bold text-on-surface">{total}</span> {plural}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-label font-bold text-on-surface bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label={t(locale, "pagination_prev")}
          >
            <Icon name="chevron_left" className="text-subhead rtl:rotate-180" />
          </button>
          <span className="text-label text-outline px-1 tabular-nums">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-label font-bold text-on-surface bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label={t(locale, "pagination_next")}
          >
            <Icon name="chevron_right" className="text-subhead rtl:rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}
