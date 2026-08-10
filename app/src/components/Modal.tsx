import { useId, type ReactNode } from "react";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "./Icon";

export type ModalVariant = "center" | "sheet" | "fullscreen";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Defaults to "center" — a card that's a bottom sheet on mobile widths and
   * centered on desktop. "sheet" is the same idea but always bottom-anchored
   * (for content that's mobile-only, like a filter drawer). "fullscreen" skips
   * the card entirely — the caller's children own the whole viewport (a
   * lightbox), and `onClose`/focus-trap/Escape still come from this component. */
  variant?: ModalVariant;
  /** Rendered as the shared header (title + close button). Omit for a modal
   * that draws its own chrome (e.g. fullscreen) — pass `ariaLabel` instead so
   * the dialog is still announced correctly. */
  title?: ReactNode;
  ariaLabel?: string;
  /** center variant only: max-w-2xl instead of max-w-md. */
  wide?: boolean;
  closeLabel?: string;
  /** Disables the header close button (e.g. while a submit is in-flight so a
   * stray click can't lose unsent input). Backdrop-click/Escape still route
   * through the `onClose` passed in — gate those at the call site by making
   * that callback itself a no-op while busy. */
  closeDisabled?: boolean;
  panelClassName?: string;
  /** fullscreen variant only — e.g. swipe-to-navigate on a gallery. */
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

/**
 * One dialog shell for the whole app (CMP-06) — replaces five hand-rolled
 * versions (Home's review modal, MyRequests' review modal, CompanyProfile's
 * feedback/waitlist/lightbox, admin's ModalShell) that had each independently
 * drifted on backdrop opacity, z-index, radius, and mobile-vs-desktop
 * positioning. Focus trap, Escape-to-close and backdrop-click all come from
 * `useDialogA11y` here instead of being wired at every call site.
 */
export default function Modal({
  onClose, children, variant = "center", title, ariaLabel, wide, closeLabel, closeDisabled, panelClassName = "",
  onTouchStart, onTouchEnd,
}: ModalProps) {
  const { locale } = useLocale();
  const titleId = useId();
  const { containerRef, trapTab } = useDialogA11y(true, onClose);

  if (variant === "fullscreen") {
    return (
      <div
        ref={containerRef}
        onKeyDown={trapTab}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 ${panelClassName}`}
        onClick={onClose}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    );
  }

  const isSheet = variant === "sheet";

  return (
    <div
      className={`fixed inset-0 z-50 flex pt-4 px-4 modal-backdrop-safe bg-on-background/45 backdrop-blur-sm ${
        isSheet ? "items-end justify-center" : "items-end sm:items-center justify-center"
      }`}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        className={`bg-surface-container-lowest w-full shadow-2xl overflow-y-auto overscroll-contain ${
          isSheet
            ? "max-w-lg rounded-t-3xl modal-max-h-85"
            : `${wide ? "max-w-2xl" : "max-w-md"} rounded-t-2xl sm:rounded-2xl modal-max-h-92`
        } ${panelClassName}`}
      >
        {/* Deliberately no "drag handle" bar here (CMP-09): the classic
            grip-bar affordance implies drag-to-dismiss, which this component
            doesn't implement — a decorative handle that doesn't drag is worse
            than no handle at all. Close via the × button, Escape, or
            backdrop-click instead. */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
            <h2 id={titleId} className="font-bold text-subhead text-on-surface flex items-center gap-2">{title}</h2>
            <button
              onClick={onClose}
              disabled={closeDisabled}
              aria-label={closeLabel ?? t(locale, "common_close")}
              className="w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors flex-shrink-0 disabled:opacity-40"
            >
              <Icon name="close" className="text-outline" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
