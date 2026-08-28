import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Animates a number from 0 to `target` on mount — the mobile counterpart of
 * the website's hooks/useCountUp.ts. The website starts the animation when
 * the counter scrolls into view (IntersectionObserver); there's no RN
 * equivalent worth building for a section that sits right below the hero and
 * is on-screen within a beat of load, so this starts as soon as `target` is
 * known (still 0 while categories/companies are loading — see home.tsx).
 */
export function useCountUp(target: number, duration = 1200): number {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (target <= 0) return;
    if (started.current) {
      // `target` changing AFTER the first animation is a real case now that
      // home.tsx refetches its stats when it comes back into view: a partner
      // count that went 42 → 43 must show 43. Snapped, not re-animated —
      // replaying the count-up on a screen the customer is already reading
      // reads as a glitch, and this is the same "animate on arrival only"
      // intent the guard always had.
      setCount(target);
      return;
    }
    started.current = true;

    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      // Same accommodation as the website's prefers-reduced-motion check —
      // jump straight to the final value instead of counting up.
      if (reduced) {
        setCount(target);
        return;
      }
      const startTime = Date.now();
      const tick = () => {
        if (cancelled) return;
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic, same as web
        setCount(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
    };
  }, [target, duration]);

  return count;
}
