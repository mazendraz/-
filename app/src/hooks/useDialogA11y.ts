import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusable(el: HTMLElement | null): HTMLElement[] {
  return el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

// Makes every element OUTSIDE the dialog inert (plus aria-hidden as a fallback
// for the rare AT/browser combination without inert support), by walking up
// from the dialog's own role="dialog" boundary and inerting siblings at each
// level up to <html>. This works unmodified whether the dialog is portaled
// straight to document.body (its only sibling there is #root) or rendered
// inline inside the app tree (drawers, sheets) — at every level it only ever
// touches siblings of the path from the dialog to the document root, so the
// dialog's own backdrop/panel are never touched.
function inertOutside(dialogBoundary: HTMLElement): () => void {
  const touched: HTMLElement[] = [];
  let node: HTMLElement = dialogBoundary;
  while (node.parentElement) {
    const parent = node.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute("inert")) {
        sibling.setAttribute("inert", "");
        sibling.setAttribute("aria-hidden", "true");
        touched.push(sibling);
      }
    }
    node = parent;
  }
  return () => {
    for (const el of touched) {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  };
}

/**
 * Wires up a dialog panel for accessibility:
 *   - Moves focus in on open (first focusable descendant, or the panel itself)
 *   - Makes the rest of the document inert while open
 *   - Locks background scroll while open
 *   - Traps Tab/Shift+Tab within the container
 *   - Closes on Escape
 *   - Returns focus to the previously focused element on close
 *
 * Usage:
 *   const { containerRef, trapTab } = useDialogA11y(open, onClose);
 *   <div ref={containerRef} onKeyDown={trapTab} role="dialog" aria-modal>…</div>
 *
 * The ref must land on the element carrying (or nested inside) role="dialog" —
 * inertOutside() looks for the closest one to find the dialog's boundary.
 */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const panel = containerRef.current;

    const focusable = getFocusable(panel);
    if (focusable.length) {
      focusable[0].focus();
    } else if (panel) {
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      panel.focus();
    }

    const boundary = (panel?.closest('[role="dialog"]') as HTMLElement | null) ?? panel;
    const restoreInert = boundary ? inertOutside(boundary) : () => {};

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      restoreInert();
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
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
