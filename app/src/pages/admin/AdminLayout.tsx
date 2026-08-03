import { Suspense } from "react";
import { Outlet, useLocation, useSearchParams, Navigate } from "react-router-dom";
import { useLeads } from "../../lib/requests";
import { useUnreadFeedbackCount } from "../../lib/feedback";
import { usePendingChangeCount } from "../../lib/changeRequests";
import { useUnreadChatCount } from "../../lib/chat";
import { useLeadStats } from "../../lib/stats";
import { logout, isAuthenticated } from "../../lib/auth";
import DashboardShell from "../../components/DashboardShell";
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

  return (
    <DashboardShell
      title={topbarTitle}
      topbarActions={isAuthenticated() && (
        <button onClick={() => logout()} title={t(locale, "admin_sign_out")} className="flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 rounded-xl font-bold text-label hover:bg-surface-container-high transition-colors touch-press btn-press">
          <Icon name="logout" className="text-subhead" /><span className="hidden sm:inline">{t(locale, "admin_sign_out")}</span>
        </button>
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
    >
      {/* Own Suspense boundary so switching tabs shows a lightweight fallback
          within the shell (sidebar + topbar stay put) instead of a blank
          screen while that tab's chunk loads. */}
      <Suspense fallback={<TabFallback />}>
        <Outlet />
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
