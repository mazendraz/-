/**
 * Counts the dropdown-style overlays that are currently open — `Select`'s
 * option panel and `CategoryMultiSelect`'s results list.
 *
 * It exists to give Escape the right target. Escape should close the innermost
 * open thing, but a dialog's Escape handler (see `useDialogA11y`) is registered
 * on `document` in the *capture* phase, so it always runs before any handler
 * belonging to a dropdown inside it — and registration order can't fix that,
 * since the dialog necessarily mounts first. The result was that Escape on an
 * open dropdown tore down the whole dialog around it.
 *
 * So the dialog asks here instead: while a dropdown is open, Escape isn't the
 * dialog's to consume, and it lets the event through to the dropdown's own
 * handler.
 *
 * A counter rather than a boolean because two of these can legitimately be open
 * at once during a click that moves focus from one dropdown to another.
 */
let openCount = 0;

/** Call while a dropdown is open; invoke the returned release on close. */
export function registerTransientOverlay(): () => void {
  openCount++;
  let released = false;
  // Idempotent: a double-invoked release (React re-running an effect cleanup)
  // must not decrement the count twice and hide a still-open dropdown.
  return () => {
    if (released) return;
    released = true;
    openCount--;
  };
}

export function hasOpenTransientOverlay(): boolean {
  return openCount > 0;
}
