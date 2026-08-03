import { useEffect, useRef, useState } from "react";

const MAX_DOTS = 5;

/**
 * RESP-04: `.mobile-scroll` hides the native scrollbar with nothing standing
 * in for it — this drives a small dot indicator instead. Caps at MAX_DOTS
 * rather than one dot per item: a horizontally-scrolling list can have far
 * more items than make sense as individual dots (companies, in particular,
 * has no fixed count), so dots represent SCROLL POSITION, not item identity.
 *
 * `scrollLeft` sign/direction is inconsistent across browsers under RTL
 * (Chrome/Firefox/Safari each picked a different convention) — normalizing
 * through `Math.abs` keeps the 0→1 progress calculation correct everywhere
 * without needing to special-case any specific engine.
 */
export function useScrollDots<T extends HTMLElement>(itemCount: number) {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(0);
  const dotCount = Math.min(itemCount, MAX_DOTS);

  useEffect(() => {
    const el = ref.current;
    if (!el || dotCount <= 1) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        const progress = max > 0 ? Math.min(Math.abs(el.scrollLeft) / max, 1) : 0;
        setActive(Math.round(progress * (dotCount - 1)));
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [dotCount]);

  return { ref, active, dotCount };
}
