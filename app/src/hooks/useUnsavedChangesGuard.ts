import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * UX-09: closing an editor or navigating away used to discard unsaved work
 * with no prompt at all. Covers the two ways work gets lost on a real page
 * (not a modal — see below):
 *  - Closing/reloading the TAB — `beforeunload`, wired whenever `dirty`.
 *  - Leaving via in-app navigation (a nav link, Back) — `useBlocker`, which
 *    only fires for actual route changes. A modal's own close button doesn't
 *    navigate anywhere, so guard that separately with `window.confirm` (or a
 *    styled confirm) at the call site instead of this hook.
 *
 * Returns the blocker so the caller can render a confirm UI when
 * `blocker.state === "blocked"` and call `blocker.proceed()`/`blocker.reset()`.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return useBlocker(dirty);
}
