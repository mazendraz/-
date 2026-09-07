import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { track } from "../lib/tracking";

/**
 * Counts one `page_view` per route the visit reaches.
 *
 * Mounted once, in RootLayout, rather than per page: this is a single-page app,
 * so a route change fires no browser navigation and a per-page call would have
 * to be remembered in every new page component (and would be forgotten in one).
 */
export function usePageTracking(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    track("page_view", { path: pathname });
  }, [pathname]);
}
