import { Suspense, useState } from "react";
import { Outlet, useLocation, useSearchParams, Navigate } from "react-router-dom";
import { useLeads } from "../../lib/requests";
import { useUnreadFeedbackCount } from "../../lib/feedback";
import { usePendingChangeCount } from "../../lib/changeRequests";
import { useUnreadChatCount } from "../../lib/chat";
import { useLeadStats } from "../../lib/stats";
import { logout, isAuthenticated } from "../../lib/auth";
import DashboardShell from "../../components/DashboardShell";
import BottomNav from "../../components/BottomNav";
import DashboardRefreshButton from "../../components/DashboardRefreshButton";
import { type AdminTab, NAV } from "./nav";
import { SidebarBody } from "./components/SidebarBody";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import Icon from "../../components/Icon";

/**
 * NAV-06: the admin dashboard's 10 tabs used to be `useState` read once from
 * `?tab=` on load — the browser's Back button left the whole dashboard
 * instead of moving between tabs, no tab could be linked to directly, and a
 * refresh always landed back on Overview. Each tab is now a real nested route
 * under `/admin`, lazy-loaded on its own (see main.tsx) instead of all 10
 * tabs + every editor shipping in one chunk.
 */
export default function AdminLayout() {
  const { locale } = useLocale();
  const location = useLocation();
  const leads = useLeads();
  const unreadFeedback = useUnreadFeedbackCount();
  const pendingChanges = usePendingChangeCount();
  const unreadChats = useUnreadChatCount();

  // The "new leads" badge counts the whole table. Derived from `leads` it was
  // counting one capped page, so the badge stopped growing at exactly the point
  // an admin most needs it to be right.
  const { stats: agg } = useLeadStats({ days: 1, months: 1 });
  const newLeadCount = agg ? (agg.byStatus.New ?? 0) : leads.filter((l) => l.status === "New").length;

  const tab = (location.pathname.split("/").filter(Boolean).pop() ?? "overview") as AdminTab;
  const topbarTitle = (() => { const cfg = NAV.find((n) => n.id === tab); return cfg ? t(locale, cfg.labelKey) : ""; })();

  // DM-16: forces the current tab to remount — see DashboardRefreshButton.tsx
  // for why that's a real refetch and not decoration. Scoped to the tab on
  // screen, not the whole layout: the sidebar's own badge counts (leads/chat/
  // changes, all one-shot fetches with no polling) don't refresh with it —
  // an admin pulling on the Leads list is asking to update THAT list, not
  // silently also reset the drawer/sidebar state around it.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <DashboardShell
      title={topbarTitle}
      topbarActions={isAuthenticated() && (
        <>
          <DashboardRefreshButton onRefresh={() => setRefreshKey((k) => k + 1)} />
          {/* DM-17: the label is `hidden sm:inline`, so below sm this is a bare
              glyph. `title` does not surface on touch — aria-label is what names
              it for a screen reader once the text node is hidden. */}
          <button onClick={() => logout()} title={t(locale, "admin_sign_out")} aria-label={t(locale, "admin_sign_out")} className="flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 min-h-[44px] rounded-xl font-bold text-label hover:bg-surface-container-high transition-colors touch-press btn-press">
            <Icon name="logout" className="text-subhead" /><span className="hidden sm:inline">{t(locale, "admin_sign_out")}</span>
          </button>
        </>
      )}
      renderSidebar={(closeDrawer) => (
        <SidebarBody
          tab={tab}
          newCount={newLeadCount}
          reviewBadge={unreadFeedback}
          changeBadge={pendingChanges}
          chatBadge={unreadChats}
          onClose={closeDrawer}
        />
      )}
      // DM-07: below md:, tab-switching was hamburger → drawer → tap → close,
      // for all 10 tabs alike — the four an admin actually lives in (new
      // leads, chat replies, pending approvals) buried exactly as deep as
      // Settings. Badges reuse the same three counts the sidebar already
      // computes above — no new counters invented, so the two stay in sync
      // by construction rather than by two places agreeing to update together.
      bottomNav={
        <BottomNav
          ariaLabel={t(locale, "nav_bottom_quick")}
          items={[
            { to: "/admin/overview", label: t(locale, "admin_tab_overview"), icon: "dashboard" },
            { to: "/admin/leads", label: t(locale, "admin_tab_leads"), icon: "inbox", badge: newLeadCount },
            { to: "/admin/chat", label: t(locale, "admin_tab_chat"), icon: "forum", badge: unreadChats },
            { to: "/admin/changes", label: t(locale, "admin_tab_changes"), icon: "rate_review", badge: pendingChanges },
          ]}
        />
      }
    >
      {/* Own Suspense boundary so switching tabs shows a lightweight fallback
          within the shell (sidebar + topbar stay put) instead of a blank
          screen while that tab's chunk loads. */}
      <Suspense fallback={<TabFallback />}>
        <Outlet key={refreshKey} />
      </Suspense>
    </DashboardShell>
  );
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

/**
 * The `/admin` index route. Also the back-compat landing spot for the old
 * `?tab=` deep-link shape (still baked into e.g. chat push-notification
 * payloads server-side) — redirects `/admin?tab=chat` to `/admin/chat`
 * instead of silently dropping the requested tab.
 */
export function AdminIndexRedirect() {
  const [params] = useSearchParams();
  const requested = params.get("tab");
  const target = NAV.find((n) => n.id === requested)?.id ?? "overview";
  return <Navigate to={target} replace />;
}
