import { Redirect } from "expo-router";
import { useCustomerAuth } from "../lib/customerAuth";

/**
 * The launch route. By the time this renders, RootLayout has already
 * awaited bootstrapSession() (see app/_layout.tsx) — `loading` here is
 * therefore always false; the check exists to satisfy the type, not because
 * this screen has anything to do while it's true.
 *
 * Two destinations: the signed-in tab shell (landing on Home) or sign-in.
 */
export default function Index() {
  const { customer, loading } = useCustomerAuth();
  if (loading) return null;
  return <Redirect href={customer ? "/home" : "/sign-in"} />;
}
