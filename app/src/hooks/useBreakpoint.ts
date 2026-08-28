import { useEffect, useState } from "react";

/**
 * Tailwind's breakpoints, in JS.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Some things can only be hidden with CSS, and some things must not be. A
 * `hidden md:block` wrapper is still MOUNTED — React renders it, its effects
 * run, its requests fire — it is merely invisible. That is fine for a heading
 * and wrong for anything that does work.
 *
 * It was wrong for the chat: the dashboards render the conversation twice, once
 * in the desktop grid (`hidden md:block`) and once inside MobileChatOverlay
 * (`md:hidden`), so BOTH ChatThread instances mounted on every device. Each ran
 * its own initial fetch, its own poll loop, and its own read-marking — double
 * the traffic on the busiest endpoint in the app, against a single PM2 fork.
 *
 * ── These values must match tailwind.config.js ───────────────────────────────
 * app/tailwind.config.js does not override `theme.screens`, so these are
 * Tailwind's defaults. If a custom `screens` is ever added, THIS FILE HAS TO
 * CHANGE WITH IT — a mismatch produces a viewport band where the component
 * renders in neither pane, which is worse than rendering in both.
 */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * True when the viewport is at least `bp` wide — the JS counterpart of Tailwind's
 * `md:` / `lg:` prefixes.
 *
 * Defaults to `true` where `matchMedia` is unavailable (tests, any non-DOM
 * render). That direction is deliberate: the desktop branch is the in-flow one,
 * so a wrong guess degrades to a normally-laid-out page rather than to a
 * `position: fixed` overlay covering a viewport it was never measured against.
 */
export function useAtLeast(bp: Breakpoint): boolean {
  const query = `(min-width: ${BREAKPOINTS[bp]}px)`;

  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    // Re-read on subscribe: the viewport can change between the initial render
    // and this effect (an orientation flip during hydration, a devtools resize),
    // and a listener only reports changes AFTER it is attached.
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
