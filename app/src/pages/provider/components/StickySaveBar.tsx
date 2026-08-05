import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

/**
 * Sticky bottom action bar for the profile editor — mirrors the sticky
 * save-bar idiom already used by admin/SettingsTab.tsx (`sticky bottom-0
 * dashboard-bottom-safe`), which already clears the mobile BottomNav via the
 * `.dashboard-has-bottom-nav` CSS in index.css. Rendered by the parent only
 * while there are dirty fields.
 */
export default function StickySaveBar({
  dirtyCount, saving, onSave, onCancel,
}: {
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="toast-enter sticky bottom-0 z-10 -mx-4 md:-mx-6 mt-6 px-4 md:px-6 py-3 dashboard-bottom-safe bg-surface-container-lowest/97 backdrop-blur-lg border-t border-outline-variant/20 flex items-center gap-3">
      <p className="flex items-center gap-1.5 text-label font-bold text-secondary min-w-0">
        <Icon name="edit_note" className="text-subhead flex-shrink-0" />
        <span className="truncate">
          {t(locale, "prov_profile_unsaved")} · {dirtyCount} {tCount(locale, "noun_profile_change", dirtyCount)}
        </span>
      </p>
      <div className="flex items-center gap-2 ms-auto flex-shrink-0">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-label text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 touch-press"
        >
          {t(locale, "prov_profile_cancel")}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors disabled:opacity-50 touch-press btn-press"
        >
          {saving ? <Icon name="progress_activity" className="text-subhead animate-spin" /> : <Icon name="send" className="text-subhead" />}
          {t(locale, saving ? "prov_profile_saving" : "prov_profile_save_changes")}
        </button>
      </div>
    </div>
  );
}
