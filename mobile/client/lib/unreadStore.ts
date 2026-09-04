/**
 * The numbers the tab bar's red badges draw: how many unread chat messages
 * this account is sitting on (الرسائل), and how many unread notifications
 * (حسابي — the notification centre is one tap inside that tab, see
 * (tabs)/account.tsx's الإشعارات row).
 *
 * ── Why a store rather than state on the bar ────────────────────────────────
 * Three different places already know something about unread counts and none
 * of them can see each other:
 *
 *   - `(tabs)/messages.tsx` fetches `GET /customer/chat/summaries` every time
 *     it loads, and each summary carries its own `unread`.
 *   - `chat/[leadId].tsx` opening a thread CLEARS that thread's counter
 *     server-side (a full read calls chat.markRead — see api's
 *     customer/leads/[id]/messages route), so the badge is stale the moment a
 *     conversation is opened.
 *   - `components/TabBar.tsx` draws the badge but is mounted outside the tab
 *     navigator (see AppShell.tsx) and has no data of its own.
 *
 * A module-level store with `useSyncExternalStore` — the same convention the
 * Business App uses for its own tab badges (mobile/business/lib/liveBadges.ts,
 * approvalsStore.ts) — lets the messages screen DONATE the counts it already
 * fetched instead of the bar fetching them a second time, and lets the chat
 * screen zero one thread without anybody re-querying.
 *
 * Deliberately not a React context: the bar lives above the navigator and the
 * screens live inside it, so a provider wrapping both would have to sit at the
 * root and re-render the entire app on every count change.
 */
import { useSyncExternalStore } from "react";
import type { ApiThreadSummary } from "@alassema/core";
import { fetchThreadSummaries } from "./chat";
import { fetchNotifications } from "./notifications";

let unreadMessages = 0;
// Both counters share ONE listener set. A change to either re-runs every
// subscriber, which is right here rather than wasteful: the only subscriber is
// the tab bar, and it reads both.
let unreadNotifications = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshotMessages(): number {
  return unreadMessages;
}

function snapshotNotifications(): number {
  return unreadNotifications;
}

function setMessages(next: number): void {
  const clamped = Math.max(0, next);
  if (clamped === unreadMessages) return;
  unreadMessages = clamped;
  notify();
}

function setNotifications(next: number): void {
  const clamped = Math.max(0, next);
  if (clamped === unreadNotifications) return;
  unreadNotifications = clamped;
  notify();
}

/**
 * Adopt the totals from a summaries payload the caller already has in hand.
 * Called by the messages screen after every load, so the common case costs no
 * extra request.
 */
export function setUnreadFromSummaries(summaries: ApiThreadSummary[]): void {
  setMessages(summaries.reduce((total, s) => total + (s.unread ?? 0), 0));
}

/**
 * Ask the server. Silent by contract: a badge is decoration, and a failed
 * refresh must never surface an error over a screen the customer is using —
 * the same fail-open rule every notification path in this codebase follows.
 */
export async function refreshUnreadMessages(): Promise<void> {
  try {
    setUnreadFromSummaries(await fetchThreadSummaries());
  } catch {
    // Offline, 401 mid-refresh, server hiccup — keep the last known count.
  }
}

/**
 * The notification centre's own unread count, donated by the screen that
 * already fetched it — the same "hand it over rather than fetch it twice"
 * arrangement setUnreadFromSummaries has with the messages list. Called by
 * notifications.tsx on load AND after mark-all-read, which is what makes the
 * حسابي badge clear the moment the customer reads the list rather than at the
 * next poll.
 */
export function setUnreadNotifications(count: number): void {
  setNotifications(count);
}

/**
 * One notification opened. Reads the live count rather than taking a new
 * total, so two taps landing in the same React batch each subtract one — a
 * caller passing `count - 1` from its own render closure would have both
 * compute from the same stale number.
 */
export function decrementUnreadNotifications(): void {
  setNotifications(unreadNotifications - 1);
}

/** Ask the server. Silent by contract, exactly like refreshUnreadMessages. */
export async function refreshUnreadNotifications(): Promise<void> {
  try {
    setNotifications((await fetchNotifications()).unreadCount);
  } catch {
    // Offline, 401 mid-refresh, server hiccup — keep the last known count.
  }
}

/** Sign-out, or an account switch — nothing to carry across, for either count. */
export function resetUnread(): void {
  setMessages(0);
  setNotifications(0);
}

/** The الرسائل badge's number. 0 means "draw nothing". */
export function useUnreadMessages(): number {
  return useSyncExternalStore(subscribe, snapshotMessages, snapshotMessages);
}

/** The حسابي badge's number. 0 means "draw nothing". */
export function useUnreadNotifications(): number {
  return useSyncExternalStore(subscribe, snapshotNotifications, snapshotNotifications);
}
