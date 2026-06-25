import { useEffect, useState } from "react";

/** Thin progress bar at the very top of the page showing scroll depth. */
export default function ScrollProgress() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // rAF-throttle so the layout read (scrollHeight/clientHeight) and state update
    // happen at most once per frame instead of on every scroll event.
    let ticking = false;
    const update = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const el = document.documentElement;
        const scrolled = el.scrollTop || document.body.scrollTop;
        const max = el.scrollHeight - el.clientHeight;
        setWidth(max > 0 ? Math.min((scrolled / max) * 100, 100) : 0);
        ticking = false;
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (width === 0) return null;

  return (
    <div
      className="scroll-progress-bar"
      style={{ width: `${width}%` }}
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  );
}
