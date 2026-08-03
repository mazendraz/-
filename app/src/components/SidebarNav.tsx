import { NavLink } from "react-router-dom";

export interface SidebarNavItem<T extends string> {
  id: T;
  icon: string;
  label: string;
  badge?: number;
  /** Distinguishes "someone is waiting on you" (primary) from "something needs
   * attention" (error/warning) — same pill shape, different color. */
  badgeVariant?: "primary" | "error" | "warning";
  badgeTitle?: string;
}

interface SidebarNavProps<T extends string> {
  items: SidebarNavItem<T>[];
  activeId: T;
  /** Route-driven (admin, after NAV-06): each item becomes a real link. */
  linkTo?: (id: T) => string;
  /** State-driven (provider dashboard): each item is a tab-switching button. */
  onSelect?: (id: T) => void;
  /** Fires on any item click in addition to routing/onSelect — wire this to
   * closing the mobile drawer even in `linkTo` mode, where the click's only
   * other effect is a route change. */
  onNavigate?: () => void;
}

const BADGE_CLASS: Record<NonNullable<SidebarNavItem<string>["badgeVariant"]>, string> = {
  primary: "bg-primary text-on-primary",
  error: "bg-error text-white",
  warning: "bg-amber-500 text-white",
};

/**
 * The nav-item list shared by the admin sidebar and the provider dashboard
 * sidebar (CODE-01/02) — active-tab marker, icon, label and an optional
 * badge. Was hand-copied into both `SidebarBody.tsx` and `ProviderDashboard`'s
 * inline `ProviderSidebarBody`, which is how they'd each independently drift
 * (physical vs logical positioning, `ml-auto` vs `ms-auto`) whenever only one
 * copy got a fix.
 */
export default function SidebarNav<T extends string>({ items, activeId, linkTo, onSelect, onNavigate }: SidebarNavProps<T>) {
  return (
    <nav className="flex-grow px-3 py-4 space-y-1 overflow-y-auto">
      {items.map((item) => {
        const active = item.id === activeId;
        const className = `w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-label font-bold transition-colors relative touch-press ${
          active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        }`;
        const content = (
          <>
            {/* Logical `start`/`e`, not left/right: in Arabic the rail is on
                the right, so a physically-left marker would land detached
                from its tab. */}
            {active && <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-e-full" />}
            <span className="material-symbols-outlined text-title" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true" translate="no">
              {item.icon}
            </span>
            {item.label}
            {!!item.badge && item.badge > 0 && (
              <span
                className={`ms-auto text-caption font-bold px-1.5 py-0.5 rounded-full ${BADGE_CLASS[item.badgeVariant ?? "primary"]}`}
                title={item.badgeTitle}
              >
                {item.badge}
              </span>
            )}
          </>
        );
        return linkTo ? (
          <NavLink key={item.id} to={linkTo(item.id)} className={className} onClick={onNavigate}>
            {content}
          </NavLink>
        ) : (
          <button key={item.id} onClick={() => { onSelect?.(item.id); onNavigate?.(); }} className={className}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
