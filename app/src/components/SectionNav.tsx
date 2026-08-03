import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

export interface SectionNavItem {
  id: string;
  label: string;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

/**
 * Replaces a tab strip on a long single-scroll page: each item smooth-scrolls
 * to its section instead of switching what's mounted, and stays sticky below
 * the global nav (same pattern as the filter bar on Companies.tsx) so it's
 * reachable the whole way down the page, not just at the top.
 *
 * Active-item highlighting uses one IntersectionObserver (same primitive
 * useReveal already uses elsewhere) watching a thin horizontal band near the
 * top of the viewport — whichever section's top most recently crossed that
 * band is "active", the standard scrollspy technique.
 */
export default function SectionNav({ items }: { items: SectionNavItem[] }) {
  const { locale } = useLocale();
  const [active, setActive] = useState(items[0]?.id ?? "");
  // Items rarely change after mount (fixed per company), but keep a ref so the
  // observer effect below doesn't need `items` in its dependency array and
  // re-subscribe on every render.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const elements = itemsRef.current
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t(locale, "nav_section_label")}
      className="sticky top-[var(--nav-h)] z-20 bg-surface-container-lowest/95 backdrop-blur-sm border-b border-surface-dim/30"
    >
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => scrollToSection(it.id)}
              aria-current={active === it.id ? "true" : undefined}
              className={`px-4 py-2.5 text-label font-display whitespace-nowrap border-b-2 transition-colors touch-press ${
                active === it.id
                  ? "text-primary border-primary"
                  : "text-outline border-transparent hover:text-on-surface hover:border-outline-variant"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
