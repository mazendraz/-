import { useEffect } from "react";

/**
 * Locks background scroll while `active`.
 *
 * Lives apart from `useDialogA11y` (which calls it) for `SearchOverlay`, an
 * overlay that owns its own focus handling and needs the lock alone. Its
 * hand-rolled version of this reset overflow to "" outright, which would have
 * unlocked the page out from under anything open beneath it.
 *
 * Saves and restores the previous value rather than clearing it, because these
 * dialogs nest: a `ConfirmDialog` opens on top of an editor modal, and the
 * inner one closing must not unlock the page while the outer one is still open.
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}
