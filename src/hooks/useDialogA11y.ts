import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusable(el: HTMLElement | null): HTMLElement[] {
  return el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

/**
 * Wires up a dialog panel for accessibility:
 *   - Traps Tab/Shift+Tab within the container
 *   - Closes on Escape
 *   - Returns focus to the previously focused element on close
 *
 * Usage:
 *   const { containerRef, trapTab } = useDialogA11y(open, onClose);
 *   <div ref={containerRef} onKeyDown={trapTab}>…</div>
 */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Restore focus to whatever had it before the dialog opened
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => { prev?.focus(); };
  }, [open]);

  // Escape to close (capture phase so it beats any inner Esc handlers)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = getFocusable(containerRef.current);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return { containerRef, trapTab };
}
