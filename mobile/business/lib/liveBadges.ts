/**
 * Tab badge counts — "something arrived on this tab while you weren't
 * looking at it". Deliberately NOT server state: there is no unread-count
 * endpoint (see docs/architecture/business-app/phase-4-realtime-push.md's
 * event-router table), so this is purely a live-session tally, reset on
 * every cold start and whenever the tab is actually opened.
 *
 * One counter per tab group's own layout (see (provider)/_layout.tsx and
 * (admin)/_layout.tsx), each subscribing to useLiveEvents once for the
 * whole tab bar rather than duplicating a listener per screen.
 */
import { useSyncExternalStore } from "react";

function makeBadge() {
  let count = 0;
  const listeners = new Set<() => void>();
  return {
    bump(): void {
      count += 1;
      listeners.forEach((l) => l());
    },
    clear(): void {
      if (count === 0) return;
      count = 0;
      listeners.forEach((l) => l());
    },
    use(): number {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => count,
        () => count,
      );
    },
  };
}

const leads = makeBadge();
const messages = makeBadge();

export const bumpLeadsBadge = leads.bump;
export const clearLeadsBadge = leads.clear;
export const useLeadsBadge = leads.use;

export const bumpMessagesBadge = messages.bump;
export const clearMessagesBadge = messages.clear;
export const useMessagesBadge = messages.use;

/** undefined (not 0) hides expo-router's Tabs badge entirely — a visible
 *  "0" would read as "zero new leads", which is worse than no badge. */
export function badgeLabel(count: number): string | undefined {
  if (count === 0) return undefined;
  return count > 9 ? "9+" : String(count);
}
