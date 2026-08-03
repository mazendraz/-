import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// NAV-07: React Router never scrolls to a `#hash` on its own, and
// <ScrollRestoration /> only restores/resets scroll position — it doesn't know
// about in-page anchors either, so it was winning the race and leaving `/#reviews`
// links sitting at the top of the page. Retried over a short window because the
// target section (home page content, images) can still be laying out when this
// first runs, especially right after a route change into a lazy chunk.
const RETRY_DELAYS_MS = [0, 150, 400, 800];

export function useHashScroll() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const timers = RETRY_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, delay)
    );
    return () => timers.forEach(window.clearTimeout);
  }, [hash]);
}
