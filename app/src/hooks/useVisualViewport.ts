import { useEffect, useState } from "react";

/**
 * Tracks the browser's *visual* viewport — the part actually on screen,
 * which shrinks (and offsets) when the on-screen keyboard opens. A plain
 * `position: fixed; inset: 0` element stays pinned to the LAYOUT viewport
 * instead (the full page, keyboard included) on iOS Safari, so its bottom
 * ends up hidden behind the keyboard. Correcting `height`/`top` against
 * `visualViewport` on resize/scroll is what keeps a fixed footer (the chat
 * input) riding just above the keyboard instead of underneath it.
 */
export function useVisualViewport() {
  const [rect, setRect] = useState(() => ({
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    top: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setRect({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return rect;
}
