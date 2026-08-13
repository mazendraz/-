import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";

/** "Confirm & Send" / "Save & Continue Later" — the sticky action card under CompletionSidebar. */
export default function CompletionActions({
  onSend, sending, onSaveLater,
}: {
  onSend: () => void;
  sending: boolean;
  onSaveLater: () => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-5">
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="w-full bg-primary text-on-primary rounded-xl py-4 text-center font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {sending ? t(locale, "completion_sending") : t(locale, "completion_send")}
      </button>
      <button
        type="button"
        onClick={onSaveLater}
        disabled={sending}
        className="w-full mt-3 border border-outline-variant/50 rounded-xl py-3.5 text-center font-medium text-label text-on-surface hover:border-outline-variant transition-colors disabled:opacity-60"
      >
        {t(locale, "completion_save_later")}
      </button>
      <p className="mt-3 text-caption text-outline text-center">{t(locale, "completion_send_hint")}</p>
    </div>
  );
}
