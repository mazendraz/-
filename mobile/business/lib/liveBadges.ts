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

let leadsBadge = 0;
const leadsListeners = new Set<() => void>();

export function bumpLeadsBadge(): void {
  leadsBadge += 1;
  leadsListeners.forEach((l) => l());
}

export function clearLeadsBadge(): void {
  if (leadsBadge === 0) return;
  leadsBadge = 0;
  leadsListeners.forEach((l) => l());
}

export function useLeadsBadge(): number {
  return useSyncExternalStore(
    (listener) => {
      leadsListeners.add(listener);
      return () => leadsListeners.delete(listener);
    },
    () => leadsBadge,
    () => leadsBadge,
  );
}

/** undefined (not 0) hides expo-router's Tabs badge entirely — a visible
 *  "0" would read as "zero new leads", which is worse than no badge. */
export function badgeLabel(count: number): string | undefined {
  if (count === 0) return undefined;
  return count > 9 ? "9+" : String(count);
}
