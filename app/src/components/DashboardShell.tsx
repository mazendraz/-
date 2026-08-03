import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import SkipLink from "./SkipLink";
import Logo from "./Logo";
import Icon from "./Icon";

interface DashboardShellProps {
  /** Renders the full sidebar body (brand + nav + footer, and for the
   * provider dashboard, its company selector too) — called twice, once for
   * the always-mounted desktop rail and once for the mobile drawer.
   * `closeDrawer` is `undefined` on the desktop call (no drawer to close —
   * pass it straight through to the "×" close button, which should only
   * render when it's defined) and a real close callback on the mobile call
   * (wire it into `onSelect` too, so picking a tab also closes the drawer). */
  renderSidebar: (closeDrawer?: () => void) => ReactNode;
  title: ReactNode;
  topbarActions?: ReactNode;
  children: ReactNode;
}

/**
 * The admin and provider dashboards each hand-copied this same shell — desktop
 * rail, mobile drawer, hamburger topbar (CODE-01/02) — and had drifted on
 * drawer width (`max-w-[82vw]` vs `[84vw]`) and mobile-vs-desktop padding.
 * One shell now; only the sidebar *content* and topbar actions differ.
 */
export default function DashboardShell({ renderSidebar, title, topbarActions, children }: DashboardShellProps) {
  const { locale } = useLocale();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const { containerRef: drawerRef, trapTab: trapDrawerTab } = useDialogA11y(drawerOpen, closeDrawer);

  return (
    <div className="min-h-screen bg-surface-container flex">
      <SkipLink />
      {/* Sidebar (desktop) */}
      {/* ADM-27: `flex` and `hidden md:flex` on the same element only worked
          by Tailwind's utility-ordering luck — hidden mobile-first, with the
          responsive override (and flex-col) grouped under md: instead. */}
      <aside className="w-64 bg-surface-container-lowest border-e border-outline-variant/15 min-h-screen hidden md:flex md:flex-col sticky top-0 h-screen">
        {renderSidebar()}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={t(locale, "nav_menu")}>
          <div className="absolute inset-0 bg-on-background/45 backdrop-blur-sm" onClick={closeDrawer} />
          <div
            ref={drawerRef}
            onKeyDown={trapDrawerTab}
            className="drawer-left absolute top-0 start-0 h-full w-72 max-w-[82vw] bg-surface-container-lowest shadow-2xl flex flex-col"
          >
            {renderSidebar(closeDrawer)}
          </div>
        </div>
      )}

      {/* Main */}
      <main id="main" className="flex-1 overflow-auto min-w-0">
        <div className="bg-surface-container-lowest/95 backdrop-blur-lg border-b border-outline-variant/15 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden p-1.5 -ms-1 rounded-lg hover:bg-surface-container transition-colors touch-press flex-shrink-0"
              aria-label={t(locale, "nav_open_menu")}
            >
              <Icon name="menu" className="text-on-surface text-headline" />
            </button>
            <Link to="/" className="md:hidden flex-shrink-0">
              <Logo className="h-9 w-9 object-contain rounded-lg" width={36} height={36} />
            </Link>
            <h1 className="font-display font-bold text-subhead md:text-title text-on-surface truncate">{title}</h1>
          </div>
          {topbarActions && <div className="flex items-center gap-2 flex-shrink-0">{topbarActions}</div>}
        </div>

        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
