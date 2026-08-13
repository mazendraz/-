import { t, type Locale } from "../../../lib/i18n";
import { formatEgp } from "../../../lib/pricing";
import Icon from "../../../components/Icon";

interface Totals {
  providerAmount: number;
  hasExtra: boolean;
  extraAmount: number;
  extraDescription: string;
  attachmentsCount: number;
}

/** Step 3: review card before sending — mirrors the mockup's confirmation summary. */
export function CompletionReviewCard({ totals, onBack, locale }: { totals: Totals; onBack: () => void; locale: Locale }) {
  const finalTotal = totals.providerAmount + (totals.hasExtra ? totals.extraAmount : 0);
  const rows: [string, string][] = [
    [t(locale, "completion_review_final_amount"), formatEgp(finalTotal, locale)],
    [t(locale, "completion_review_additional"), totals.hasExtra ? formatEgp(totals.extraAmount, locale) : t(locale, "completion_review_none")],
    [t(locale, "completion_review_attachments"), totals.attachmentsCount > 0 ? String(totals.attachmentsCount) : t(locale, "completion_review_none")],
  ];
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 sm:p-7">
      <div className="font-bold text-label text-on-surface mb-4">{t(locale, "completion_review_title")}</div>
      <div className="flex flex-col gap-3.5">
        {rows.map(([label, value], i) => (
          <div key={label}>
            <div className="flex justify-between items-baseline">
              <span className="text-label text-outline">{label}</span>
              <span className="font-medium text-label text-on-surface">{value}</span>
            </div>
            {i < rows.length - 1 && <div className="h-px bg-outline-variant/20 mt-3.5" />}
          </div>
        ))}
      </div>
      <div className="mt-5 bg-surface-container rounded-xl p-4 text-label text-outline">
        {t(locale, "completion_review_notice")}
      </div>
      <div className="mt-5">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-label font-medium text-outline hover:text-primary transition-colors py-2">
          <Icon name="arrow_back" className="text-body rtl-flip" /> {t(locale, "completion_back")}
        </button>
      </div>
    </div>
  );
}

/** Sticky sidebar totals card, visible from step 1 onward. */
export function CompletionSidebar({ totals, locale }: { totals: Totals; locale: Locale }) {
  const finalTotal = totals.providerAmount + (totals.hasExtra ? totals.extraAmount : 0);
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6">
      <div className="font-bold text-label text-on-surface mb-4">{t(locale, "completion_summary_title")}</div>
      <div className="flex justify-between items-baseline py-2">
        <span className="text-label text-outline">{t(locale, "completion_summary_initial")}</span>
        <span className="font-medium text-label text-on-surface [font-variant-numeric:tabular-nums]">{formatEgp(totals.providerAmount, locale)}</span>
      </div>
      {totals.hasExtra && (
        <div className="flex justify-between items-baseline py-2">
          <span className="text-label text-outline">{t(locale, "completion_summary_additional")}</span>
          <span className="font-medium text-label text-primary [font-variant-numeric:tabular-nums]">+ {formatEgp(totals.extraAmount, locale)}</span>
        </div>
      )}
      <div className="h-px bg-outline-variant/20 my-3.5" />
      <div className="text-caption font-bold tracking-wide text-outline mb-2 uppercase">{t(locale, "completion_summary_total")}</div>
      <div className="font-bold text-headline text-on-surface [font-variant-numeric:tabular-nums]">{formatEgp(finalTotal, locale)}</div>
    </div>
  );
}
