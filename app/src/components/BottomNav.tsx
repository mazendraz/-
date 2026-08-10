import { NavLink } from "react-router-dom";

export interface BottomNavItem {
  to: string;
  label: string;
  icon: string;
  /** Passed straight to NavLink's `end` — true for a root path like "/" or
   *  "/admin/overview" that would otherwise match every nested route under it. */
  end?: boolean;
  /** Omit or 0 to show no badge. */
  badge?: number;
}

interface BottomNavProps {
  items: BottomNavItem[];
  ariaLabel: string;
}

/**
 * The mobile bottom tab bar — shared by the public site (RootLayout) and,
 * since DM-07, both dashboards (AdminLayout/ProviderLayout).
 *
 * Generalized over an item list rather than forked a third time: it used to
 * read `useSaved()` directly and hardcode the public site's four tabs, which
 * only worked because it had exactly one caller. Each caller now computes its
 * own items — the public site's saved-count badge, admin's leads/chat/changes
 * badges, provider's leads badge — from whatever it already has on hand
 * (DM-07's acceptance bar: dashboard badges must match the sidebar's numbers,
 * not invent new ones).
 */
export default function BottomNav({ items, ariaLabel }: BottomNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      // PERF-04: this already read as solid at 97% opacity — backdrop-blur-xl
      // was pure repaint cost on a fixed, full-width element with zero visible
      // effect. Plain white removes that cost entirely.
      className="md:hidden fixed bottom-0 start-0 end-0 z-40 bg-white border-t border-outline-variant/20 bottom-nav-safe"
    >
      <div className="flex h-[var(--bottom-nav-h)]">
        {items.map(({ to, label, icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              // Never dilute an already-mid-tone token with an opacity modifier
              // (A11Y-13) — text-outline/70 measured ~2.3:1 against white.
              `flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors touch-press
              ${isActive ? "text-primary" : "text-outline"}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`material-symbols-outlined text-title transition-transform duration-fast ${isActive ? "scale-110" : ""}`}
                  aria-hidden="true"
                  translate="no"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {icon}
                </span>
                {!!badge && badge > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] min-w-[16px] h-[16px] px-1 bg-error text-white text-caption font-black rounded-full flex items-center justify-center leading-none">
                    {badge}
                  </span>
                )}
                <span className="text-caption font-bold leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
