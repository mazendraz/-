import { useRouteError } from "react-router-dom";
import CrashScreen from "../components/CrashScreen";
import { getCurrentUser } from "../lib/auth";

/**
 * The router's `errorElement` — anything a route throws lands here.
 *
 * Renders CrashScreen (zero-dependency) rather than a locale-aware screen: if a
 * route blew up because of the settings store or the locale provider, a screen
 * that touches those would throw again and leave a blank page.
 */
export default function ErrorPage() {
  const error = useRouteError();
  return <CrashScreen error={error} showDetails={shouldShowDetails()} />;
}

/**
 * Stack traces are for whoever can act on them — an admin. Showing a raw
 * stack to a customer leaks internal structure and tells them nothing useful.
 * ERR-03: `?debug=1` used to bypass this for anyone who guessed the param.
 *
 * Wrapped in try/catch on purpose: this runs on the error path, where
 * localStorage may be unavailable (private mode, disabled cookies). It must never
 * be the reason the error screen itself fails.
 */
function shouldShowDetails(): boolean {
  try {
    return getCurrentUser()?.role === "ADMIN";
  } catch {
    return false;
  }
}
