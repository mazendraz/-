/**
 * Open/close state for the hamburger menu, held once for the whole app.
 *
 * ── Why a store and not component state ────────────────────────────────────
 * The menu used to be a `useState` inside app/company/[slug].tsx, with its own
 * <MenuModal> rendered from that screen — so the menu literally did not exist
 * anywhere else in the app. Making it global means exactly one <MenuModal>
 * mounted at the root (see app/_layout.tsx) and any number of trigger buttons
 * that only have to say "open", which is what components/MenuButton.tsx does.
 *
 * Same singleton pattern as authGate.ts's guest-prompt store and
 * customerAuth.ts's session store — deliberately not React context, so it can
 * also be opened from a plain function (a deep link, a notification tap)
 * rather than only from inside the tree.
 */
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read by the single root-mounted <MenuModal> — not for screens. */
export function useAppMenuOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  );
}

export function openAppMenu(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeAppMenu(): void {
  if (!open) return;
  open = false;
  emit();
}
