import { Redirect } from "expo-router";

/**
 * The launch route. Guest browsing (phase 1): everyone lands on the public
 * Home tab regardless of session — screens/actions that need an account gate
 * themselves instead (see lib/authGate.ts).
 */
export default function Index() {
  return <Redirect href="/home" />;
}
