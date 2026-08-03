import { Component, type ErrorInfo, type ReactNode } from "react";
import CrashScreen from "./CrashScreen";
import { getCurrentUser } from "../lib/auth";

/**
 * Top-level crash net, mounted ABOVE <RouterProvider> in main.tsx.
 *
 * The router's own `errorElement` (ErrorPage) only catches errors thrown inside a
 * route. Anything that throws above or outside it — the router itself, a provider,
 * a top-level render — bypasses that entirely and gives the user a blank white
 * page. This catches those.
 *
 * Must remain a class: React has no hook equivalent of componentDidCatch.
 */
interface State {
  error: unknown | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console for anyone with devtools open. Deliberately not
    // reported anywhere: adding a network call to the crash path is how you turn
    // one bug into a hang.
    console.error("[al-assema] Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return <CrashScreen error={this.state.error} showDetails={showDetails()} />;
    }
    return this.props.children;
  }
}

// ERR-03: `?debug=1` used to reveal stack traces to anyone who guessed the
// param — a real internal-details leak, not just a convenience for admins
// debugging their own session.
function showDetails(): boolean {
  try {
    return getCurrentUser()?.role === "ADMIN";
  } catch {
    return false;
  }
}
