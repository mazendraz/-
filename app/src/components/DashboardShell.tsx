import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import SkipLink from "./SkipLink";
import Logo from "./Logo";
import Icon from "./Icon";

/** Live drag offset while swiping the drawer closed. `snapping: true` means
 *  the finger has already lifted and this is animating back to rest — see
 *  the `style` on the drawer panel below for how the two states differ. */
type DrawerDrag = { x: number; snapping: boolean } | null;

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
  /** DM-07: a <BottomNav/> for mobile — omit for a shell with no bottom bar.
   *  When present, `.dashboard-has-bottom-nav` is added to the wrapper so
   *  every `.dashboard-bottom-safe` region (this shell's own content padding,
   *  and any sticky save bar a tab renders) picks up its height automatically
   *  — see the CSS comment in index.css for why that's a class, not a prop
   *  threaded down to each tab. */
  bottomNav?: ReactNode;
}

/**
 * The admin and provider dashboards each hand-copied this same shell — desktop
 * rail, mobile drawer, hamburger topbar (CODE-01/02) — and had drifted on
 * drawer width (`max-w-[82vw]` vs `[84vw]`) and mobile-vs-desktop padding.
 * One shell now; only the sidebar *content* and topbar actions differ.
 */
export default function DashboardShell({ renderSidebar, title, topbarActions, children, bottomNav }: DashboardShellProps) {
  const { locale, isRTL } = useLocale();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const { containerRef: drawerRef, trapTab: trapDrawerTab } = useDialogA11y(drawerOpen, closeDrawer);

  // DM-15: the drawer used to open only from the hamburger and close only via
  // the × or a backdrop tap — Escape/focus-trap (useDialogA11y, above) cover
  // keyboard, but swipe-to-close is the gesture a phone user reaches for
  // first. RTL-aware: the drawer is pinned to the *start* edge (`start-0`
  // below), which CSS resolves to the LEFT in English and the RIGHT in
  // Arabic (see index.css's drawerInLeft/drawerRight keyframes) — so
  // "closing" drags negative in LTR and positive in RTL.
  const [drag, setDrag] = useState<DrawerDrag>(null);
  const gestureRef = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const closingSign = isRTL ? 1 : -1;

  function onDrawerTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    gestureRef.current = { x: touch.clientX, y: touch.clientY, horizontal: null };
  }
  function onDrawerTouchMove(e: React.TouchEvent) {
    const gesture = gestureRef.current;
    const touch = e.touches[0];
    if (!gesture || !touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (gesture.horizontal === null) {
      // Decide once, a few pixels in — committing on the very first pixel of
      // movement is too twitchy, and this is also what tells a vertical drag
      // (scrolling the nav list) apart from a horizontal one (closing) so
      // each can be handed to the gesture that actually owns it.
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      gesture.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!gesture.horizontal) { gestureRef.current = null; return; }
    }
    if (!gesture.horizontal) return;
    // Only follow the finger toward the closed position — dragging the other
    // way (deeper "into" the screen) has nothing to animate toward, so it's
    // clamped to 0 rather than overshooting past fully-open.
    const raw = dx * closingSign >= 0 ? dx : 0;
    const width = drawerRef.current?.offsetWidth ?? 288;
    const clamped = Math.min(Math.abs(raw), width) * closingSign;
    setDrag({ x: clamped, snapping: false });
  }
  function onDrawerTouchEnd() {
    gestureRef.current = null;
    if (!drag) return;
    const width = drawerRef.current?.offsetWidth ?? 288;
    const fraction = Math.abs(drag.x) / width;
    if (fraction > 0.3) {
      closeDrawer();
      setDrag(null);
    } else {
      // Under the threshold — spring back to rest with a real transition,
      // then hand control back to the (already-at-rest) entrance animation's
      // filled end state rather than holding an inline style forever.
      setDrag({ x: 0, snapping: true });
      window.setTimeout(() => setDrag(null), 220);
    }
  }

  return (
    <div className={`min-h-screen bg-surface-container flex ${bottomNav ? "dashboard-has-bottom-nav" : ""}`}>
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
            onTouchStart={onDrawerTouchStart}
            onTouchMove={onDrawerTouchMove}
            onTouchEnd={onDrawerTouchEnd}
            onTouchCancel={onDrawerTouchEnd}
            // DM-04: the drawer runs the full height, so its brand header sits
            // under the notch and its "back to site" footer under the home
            // indicator. Insets on both ends.
            //
            // DM-15: `drawer-left` (the entrance animation) is dropped while
            // `drag` is live — its `animation-fill-mode: both` would otherwise
            // keep winning the `transform` property over the inline style a
            // live drag needs to set every frame.
            className={`${drag ? "" : "drawer-left"} absolute top-0 start-0 h-full w-72 max-w-[82vw] bg-surface-container-lowest shadow-2xl flex flex-col dashboard-topbar-safe dashboard-bottom-safe`}
            style={drag ? {
              transform: `translateX(${drag.x}px)`,
              transition: drag.snapping ? "transform 0.2s var(--ease-out-expo)" : "none",
            } : undefined}
          >
            {renderSidebar(closeDrawer)}
          </div>
        </div>
      )}

      {/* Main */}
      {/* No `overflow-auto` here, deliberately. It never scrolled — the
          document does (measured: main's scrollHeight === clientHeight) — but
          `overflow: auto` still makes this element the nearest scrolling
          ancestor for every `position: sticky` descendant. The consequence:
          SettingsTab's "always reachable" save bar was pinned to a container
          that never moves, i.e. not sticky at all, and an admin had to scroll
          to the bottom of a ~2100px page to reach Save. `min-w-0` is what
          actually prevents flex blowout here; the overflow was doing nothing
          but breaking sticky. (Found while closing DM-04.) */}
      <main id="main" className="flex-1 min-w-0">
        {/* DM-04: `sticky top-0` puts this under the status bar / notch once the
            app is installed standalone. dashboard-topbar-safe adds the inset. */}
        <div className="dashboard-topbar-safe bg-surface-container-lowest/95 backdrop-blur-lg border-b border-outline-variant/15 px-4 md:px-6 pb-3 md:pb-4 sticky top-0 z-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* DM-06: was 36×42. `w-11 h-11` with a compensating negative margin
                gives a 44px hit box without changing the bar's height — the
                same idiom Modal.tsx's close button uses. */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden w-11 h-11 -ms-2.5 -my-1 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors touch-press flex-shrink-0"
              aria-label={t(locale, "nav_open_menu")}
            >
              <Icon name="menu" className="text-on-surface text-headline" />
            </button>
            {/* DM-06: was 36×36 — the logo is a real link back to the site. */}
            <Link to="/" className="md:hidden flex-shrink-0 w-11 h-11 -my-1 flex items-center justify-center" aria-label={t(locale, "admin_back_to_site")}>
              <Logo className="h-9 w-9 object-contain rounded-lg" width={36} height={36} />
            </Link>
            <h1 className="font-display font-bold text-subhead md:text-title text-on-surface truncate">{title}</h1>
          </div>
          {topbarActions && <div className="flex items-center gap-2 flex-shrink-0">{topbarActions}</div>}
        </div>

        {/* DM-04: content can run to the very bottom of the viewport — the last
            row of a list would otherwise sit under the home indicator. */}
        <div className="p-4 md:p-6 dashboard-bottom-safe">{children}</div>
      </main>

      {bottomNav}
    </div>
  );
}
