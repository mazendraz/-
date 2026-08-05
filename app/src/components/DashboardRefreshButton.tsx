import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "./Icon";

/**
 * DM-16. Neither dashboard had any way to pull fresh data into the tab on
 * screen short of navigating away and back — and once the app is installed
 * as a standalone PWA there is no browser chrome reload button to fall back
 * on either, so a stale list (leads that came in while the phone was locked,
 * say) had no recovery path at all.
 *
 * `onRefresh` is expected to force-remount the current tab (see
 * AdminLayout.tsx / ProviderLayout.tsx — both key their `<Outlet>` on a
 * counter this button increments), which re-runs every effect the mounted
 * tab already fires on load. That is a real refetch, not a decorative spin —
 * the spin here is the animation queued on top of it so the click has
 * feedback even when the refetch itself resolves instantly from cache.
 */
export default function DashboardRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const { locale } = useLocale();
  const [spinning, setSpinning] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  function handleClick() {
    onRefresh();
    setSpinning(true);
    setJustRefreshed(false);
    window.setTimeout(() => {
      setSpinning(false);
      setJustRefreshed(true);
    }, 600);
  }

  return (
    <>
      <button
        onClick={handleClick}
        title={t(locale, "common_refresh")}
        aria-label={t(locale, "common_refresh")}
        className="flex items-center justify-center w-11 h-11 -m-2.5 rounded-xl text-on-surface hover:bg-surface-container transition-colors touch-press flex-shrink-0"
      >
        <Icon name="refresh" className={`text-subhead ${spinning ? "animate-spin" : ""}`} aria-hidden="true" />
      </button>
      {/* The spin is a purely visual acknowledgment — this is the same
          confirmation for anyone using a screen reader instead. */}
      <span role="status" aria-live="polite" className="sr-only">
        {justRefreshed ? t(locale, "common_refreshed") : ""}
      </span>
    </>
  );
}
