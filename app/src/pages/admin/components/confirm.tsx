import { useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";

// `label` is supplied already translated by the caller — these components only
// own the words they render themselves (Delete / Cancel / Confirm).
export function ConfirmDelete({ onConfirm, label, big }: { onConfirm: () => void; label: string; big?: boolean }) {
  const { locale } = useLocale();
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="flex items-center gap-1.5">
        <button onClick={onConfirm} className={`bg-error text-white rounded-lg font-bold ${big ? "px-4 py-2.5 text-[14px]" : "px-2.5 py-2 text-[12px]"}`}>{t(locale, "admin_delete")}</button>
        <button onClick={() => setArmed(false)} className={`bg-surface-container text-on-surface rounded-lg font-bold ${big ? "px-4 py-2.5 text-[14px]" : "px-2.5 py-2 text-[12px]"}`}>{t(locale, "admin_confirm_cancel")}</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className={`flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors ${big ? "px-4 py-2.5 text-[14px]" : "px-3 py-2 text-[12px]"}`}>
      <span className="material-symbols-outlined text-[16px]">delete</span> {big ? `${t(locale, "admin_delete")} ${label}` : ""}
    </button>
  );
}

export function ConfirmAction({ label, onConfirm, danger }: { label: string; onConfirm: () => void; danger?: boolean }) {
  const { locale } = useLocale();
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => { onConfirm(); setArmed(false); }} className="bg-error text-white px-4 py-2.5 rounded-xl font-bold text-[13px]">{t(locale, "admin_confirm_ok")}</button>
        <button onClick={() => setArmed(false)} className="bg-surface-container px-4 py-2.5 rounded-xl font-bold text-[13px] text-on-surface">{t(locale, "admin_confirm_cancel")}</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className={`px-4 py-2.5 rounded-xl font-bold text-[13px] transition-colors ${danger ? "border border-error/30 text-error hover:bg-error/5" : "bg-surface-container text-on-surface hover:bg-surface-container-high"}`}>
      {label}
    </button>
  );
}
