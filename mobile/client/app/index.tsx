import { Redirect } from "expo-router";
import { useCustomerAuth } from "../lib/customerAuth";

/**
 * The launch route. By the time this renders, RootLayout has already
 * awaited bootstrapSession() (see app/_layout.tsx) — `loading` here is
 * therefore always false; the check exists to satisfy the type, not because
 * this screen has anything to do while it's true.
 *
 * Only two destinations exist so far — sign-in is the only screen built past
 * this point. "requests" is the tab navigator's future home; the redirect
 * target is named for what it SHOULD become as more of the app is built,
 * not for what exists today.
 */
export default function Index() {
  const { customer, loading } = useCustomerAuth();
  if (loading) return null;
  return <Redirect href={customer ? "/requests" : "/sign-in"} />;
}
