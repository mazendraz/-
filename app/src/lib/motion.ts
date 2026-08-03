/** Shared across any component that drives its own scroll/transition timing
 * (smooth-scroll nav, animated CTA scrolls) so they all respect the same OS
 * setting instead of each re-querying matchMedia independently. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
