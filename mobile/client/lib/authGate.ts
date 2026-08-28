/**
 * Shared account gate for guest browsing (phase 1) — the mobile counterpart
 * of the website's `next` redirect in SignIn.tsx. Anything that needs an
 * account sends a guest to /sign-in with `next` set to the path to return to,
 * instead of the old blanket tab-layout redirect that blocked the whole app.
 *
 * Two different gates for two different situations:
 *  - `useRequireAccount` — a WHOLE SCREEN that only makes sense signed in
 *    (Account, Messages, Requests). A guest only ever lands here via a stale
 *    deep link (normal tab taps are intercepted earlier — see
 *    (tabs)/_layout.tsx's guardTab), so an immediate redirect with no
 *    intermediate screen is the right call: there's nothing behind it worth
 *    explaining first.
 *  - `requireAccount` — ONE ACTION inside an otherwise public screen (save a
 *    company, tap "Request Service", open the Saved/Requests/Messages tab).
 *    This is the actual guest path in practice, so it explains WHY before
 *    sending anyone anywhere: it shows a contextual prompt (see
 *    components/GuestPromptModal.tsx) with copy specific to the action, and
 *    only navigates to /sign-in if the guest chooses to.
 */
import { useCallback, useSyncExternalStore } from "react";
import { router, useFocusEffect } from "expo-router";
import { useCustomerAuth, type Customer } from "./customerAuth";

/**
 * Redirect a guest away from a screen that only makes sense signed in.
 *
 * ── Why useFocusEffect and not useEffect ────────────────────────────────────
 * expo-router keeps a tab screen MOUNTED after its first visit, so Account,
 * Requests and Messages are all live at once for anyone who has opened them.
 * With a plain mount-time effect, `customer` going null — i.e. signing out —
 * fired this in all three simultaneously: three racing `router.replace` calls,
 * and the `next` that survived was whichever ran last. Sign out from Account and
 * you'd land on sign-in asked to return to /messages.
 *
 * The worse half was that signing out pushed the customer straight back into
 * sign-in at all. This app supports guest browsing by design (see the module
 * comment); the sign-out button is how you BECOME a guest, and it was the one
 * action that made that impossible.
 *
 * Focus-gating fixes both: only the screen actually on top redirects, and
 * customerLogout() navigates to /home first, so by the time the state clears the
 * focused screen is one that never needed an account.
 */
export function useRequireAccount(next: string): Customer | null {
  const { customer, loading } = useCustomerAuth();

  useFocusEffect(
    useCallback(() => {
      if (!loading && !customer) {
        router.replace({ pathname: "/sign-in", params: { next } });
      }
    }, [loading, customer, next]),
  );

  return customer;
}

// ── Guest prompt store ──────────────────────────────────────────────────────
// A global singleton (same pattern as customerAuth.ts's snapshot store), not
// React context: `requireAccount` below needs to trigger the prompt from
// plain functions too — a tab bar's `tabPress` listener isn't a component and
// has no context to read. One <GuestPromptModal/> mounted once at the root
// (see app/_layout.tsx) subscribes and renders whatever's currently set here.
export interface GuestPromptConfig {
  /** Heading — e.g. "سجل الدخول لحفظ المفضلة". */
  title: string;
  /** One line explaining why — e.g. "سجل الدخول عشان تقدر تحفظ...". */
  subtitle: string;
  /** Where /sign-in should return to after a successful login. */
  next: string;
  /** Second button. "dismiss" just closes the prompt ("ليس الآن"); "register"
   *  sends a guest straight into sign-in's registration mode instead of its
   *  default sign-in mode ("إنشاء حساب"). Omit for a single-button prompt. */
  secondary?: { label: string; kind: "dismiss" | "register" };
}

let promptState: GuestPromptConfig | null = null;
const promptListeners = new Set<() => void>();

function setPrompt(next: GuestPromptConfig | null) {
  promptState = next;
  promptListeners.forEach((l) => l());
}

function subscribePrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

/** Read by GuestPromptModal — not meant to be called from screens directly. */
export function useGuestPrompt(): GuestPromptConfig | null {
  return useSyncExternalStore(subscribePrompt, () => promptState, () => promptState);
}

export function closeGuestPrompt(): void {
  setPrompt(null);
}

/** For interception points with no "action" to defer (a tab-bar tabPress) —
 *  just show the prompt directly, same store as `requireAccount` below. */
export function showGuestPrompt(prompt: GuestPromptConfig): void {
  setPrompt(prompt);
}

/**
 * For a single gated action inside an otherwise public screen (save, send a
 * request, open Saved/Requests/Messages): runs `action` for a signed-in
 * customer, or shows a contextual prompt for a guest explaining what signing
 * in unlocks, rather than silently teleporting them to a generic sign-in page.
 */
export function requireAccount(
  customer: Customer | null,
  action: () => void,
  prompt: GuestPromptConfig,
): void {
  if (!customer) {
    setPrompt(prompt);
    return;
  }
  action();
}
