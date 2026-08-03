import { useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import Icon from "../../../components/Icon";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

// The dialog itself now lives in the shared `components/ConfirmDialog.tsx` —
// also used by the public-site unsaved-changes guard (UX-09). Re-exported
// under its old name so admin's existing imports don't all need touching.
export { ConfirmDialog };

// `label` is supplied already translated by the caller — these components only
// own the words they render themselves (Delete / Cancel / Confirm).
export function ConfirmDelete({ onConfirm, label, big }: { onConfirm: () => void; label: string; big?: boolean }) {
  const { locale } = useLocale();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`${t(locale, "admin_delete")} ${label}`}
        className={`flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors ${big ? "px-4 py-2.5 text-label" : "w-11 h-11 -m-2.5 text-caption"}`}
      >
        <Icon name="delete" className="text-body" /> {big ? `${t(locale, "admin_delete")} ${label}` : ""}
      </button>
      {confirming && (
        <ConfirmDialog
          title={`${t(locale, "admin_delete")} ${label}`}
          message={t(locale, "admin_confirm_delete_body")}
          confirmLabel={t(locale, "admin_delete")}
          onConfirm={() => { setConfirming(false); onConfirm(); }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

export function ConfirmAction({ label, onConfirm, danger }: { label: string; onConfirm: () => void; danger?: boolean }) {
  const { locale } = useLocale();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className={`px-4 py-2.5 rounded-xl font-bold text-label transition-colors ${danger ? "border border-error/30 text-error hover:bg-error/5" : "bg-surface-container text-on-surface hover:bg-surface-container-high"}`}
      >
        {label}
      </button>
      {confirming && (
        <ConfirmDialog
          title={label}
          message={t(locale, "admin_confirm_action_body")}
          confirmLabel={t(locale, "admin_confirm_ok")}
          danger={danger}
          onConfirm={() => { setConfirming(false); onConfirm(); }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
