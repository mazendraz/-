import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { useDialogA11y } from "../hooks/useDialogA11y";

/**
 * A real confirmation dialog for destructive/consequential actions — replaces
 * the old "armed" in-place button swap (A11Y-06): that pattern caused a
 * layout shift at the exact moment of a destructive decision (the Delete
 * button could land where the user's cursor already was), had no stated
 * consequence, no Escape, and stayed armed indefinitely. This names the
 * object, states the consequence, defaults focus to Cancel (not the
 * destructive action), and closes on Escape/backdrop like every other dialog.
 *
 * Lives in `components/` (not admin-only) — also used for the public-site
 * unsaved-changes guard (UX-09) on `/request`.
 */
export function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel, danger = true, busy,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  const { locale } = useLocale();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { containerRef, trapTab } = useDialogA11y(true, onCancel);

  // Runs after useDialogA11y's own focus-in effect (declared below it), so
  // this wins: Cancel gets focus by default, never the destructive action.
  useEffect(() => { cancelRef.current?.focus(); }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-on-background/45 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={containerRef}
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface-container-lowest w-full max-w-sm rounded-2xl shadow-2xl p-5"
      >
        <h2 id={titleId} className="font-bold text-body text-on-surface mb-1.5">{title}</h2>
        <p className="text-label text-on-surface-variant mb-5">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} disabled={busy} className="px-4 py-2.5 rounded-xl font-bold text-label text-on-surface bg-surface-container hover:bg-surface-container-high transition-colors disabled:opacity-60">
            {t(locale, "admin_confirm_cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2.5 rounded-xl font-bold text-label transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${danger ? "bg-error text-white hover:bg-error/90" : "bg-primary text-on-primary hover:bg-primary/90"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
