/**
 * Shared account gate for guest browsing (phase 1) — the mobile counterpart
 * of the website's `next` redirect in SignIn.tsx. Anything that needs an
 * account sends a guest to /sign-in with `next` set to the path to return to,
 * instead of the old blanket tab-layout redirect that blocked the whole app.
 */
import { useEffect } from "react";
import { router } from "expo-router";
import { useCustomerAuth, type Customer } from "./customerAuth";

/**
 * For a whole screen that requires an account (Requests/Messages/Saved/
 * Account tabs): redirects a guest to sign-in and returns the customer once
 * resolved, or null while redirecting/loading — callers should render
 * nothing in that case rather than an authenticated screen with no session
 * behind it (a signed-out deep link, or a sign-out while sitting on the tab).
 */
export function useRequireAccount(next: string): Customer | null {
  const { customer, loading } = useCustomerAuth();

  useEffect(() => {
    if (!loading && !customer) {
      router.replace({ pathname: "/sign-in", params: { next } });
    }
  }, [loading, customer, next]);

  return customer;
}

/**
 * For a single gated action inside an otherwise public screen (save, send a
 * request): runs `action` for a signed-in customer, or sends a guest to
 * sign-in with `next` set to return to the same place.
 */
export function requireAccount(customer: Customer | null, next: string, action: () => void): void {
  if (!customer) {
    router.push({ pathname: "/sign-in", params: { next } });
    return;
  }
  action();
}
