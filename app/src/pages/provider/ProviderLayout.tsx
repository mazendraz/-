import { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useLeadsForCompany } from "../../lib/requests";
import { isApiConfigured } from "../../lib/api";
import { useCompanies, useCompanyDetail, useMyCompany, type Company } from "../../lib/catalog";
import { logout, isAuthenticated } from "../../lib/auth";
import { useLeadStats } from "../../lib/stats";
import DashboardShell from "../../components/DashboardShell";
import BottomNav from "../../components/BottomNav";
import DashboardRefreshButton from "../../components/DashboardRefreshButton";
import SidebarNav from "../../components/SidebarNav";
import Logo from "../../components/Logo";
import Icon from "../../components/Icon";
import Select from "../../components/Select";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import { PROVIDER_TABS, type ProviderTab, isProviderTab } from "./nav";
import type { ProviderOutletContext } from "./context";

/**
 * DM-02. The provider dashboard's ten tabs used to be `useState` read once from
 * `?tab=` on mount — the Back gesture left the dashboard entirely instead of
 * moving between tabs, no tab could be linked to or bookmarked, and every
 * refresh snapped back to Overview mid-task. On a phone (and in an installed
 * PWA, where there is no URL bar at all) Back is the primary navigation
 * control, which made this the single most disruptive thing about using the
 * dashboard on mobile.
 *
 * Each tab is now a real nested route under `/provider`, lazy-loaded on its own
 * (see main.tsx) rather than all ten shipping in one chunk with the charting
 * library, the offerings editor and the chat client (DM-12).
 *
 * Deliberately mirrors admin/AdminLayout.tsx, which went through the same
 * conversion under NAV-06 — including `ProviderIndexRedirect` below, the
 * back-compat landing spot for the old `?tab=` links.
 */
export default function ProviderLayout() {
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const apiMode = isApiConfigured();

  // The provider's own company comes from /provider/profile — scoped to their
  // companyId server-side, so it resolves regardless of company status and no
  // matter how large the platform gets. Reading it out of the public catalog
  // (ACTIVE-only, first 100 rows) is what used to lock providers out entirely.
  const { company: ownCompany, loading: ownLoading } = useMyCompany();

  // Demo mode only (no API, no session): pick from the local catalog.
  const allCompanies = useCompanies();
  const [selectedSlug, setSelectedSlug] = useState("");
  // DM-16: forces the current tab to remount — see DashboardRefreshButton.tsx
  // and AdminLayout's identical wiring for the rationale. Scoped to the tab on
  // screen: `stats`/`agg`/`company` (this file's own top-level fetches, which
  // the sidebar badge and every tab both read via context) don't refresh with
  // it — only what the tab's OWN effects re-fetch on remount does.
  //
  // Declared here, ABOVE the loading/no-company early returns below — a hook
  // called after a conditional return fires on some renders and not others,
  // which is exactly the "Rendered more hooks than during the previous
  // render" crash this one produced when it was first written further down.
  const [refreshKey, setRefreshKey] = useState(0);
  // Derived, not a useState initializer: on a cold cache allCompanies is empty
  // on first render, and an initializer would have frozen "" forever.
  const demoSlug = selectedSlug || allCompanies[0]?.slug || "";
  const demoDetail = useCompanyDetail(apiMode ? "" : demoSlug);

  const company = apiMode ? ownCompany : demoDetail.company;
  const effectiveSlug = company?.slug ?? "";
  const companies = apiMode ? (company ? [company] : []) : allCompanies;
  const leads = useLeadsForCompany(effectiveSlug);

  // Phase 9 — the Pricing tab only exists for a company whose category has
  // opted into a fixed catalog. Filtering the nav (rather than hiding the
  // rendered content only) keeps the sidebar, the topbar title lookup and the
  // redirect below reading from one source of truth.
  const pricingAllowed = company?.categoryPricingMode === "FIXED_CATALOG";
  const tabs = PROVIDER_TABS.filter((tb) => tb.id !== "pricing" || pricingAllowed);

  const tab = (location.pathname.split("/").filter(Boolean)[1] ?? "overview") as ProviderTab;

  // Rare but real: an admin can flip a category off while this provider already
  // has the Pricing tab open — send them back to Overview rather than leaving
  // them on a pane that just vanished from the sidebar. A deep link that never
  // had access is a different case, handled inside the Pricing tab itself (an
  // explanation, not a silent bounce — arriving via a real link deserves one).
  useEffect(() => {
    if (!ownLoading && !pricingAllowed && tab === "pricing" && company) {
      navigate("/provider/overview", { replace: true });
    }
  }, [pricingAllowed, tab, ownLoading, company, navigate]);

  // Whole-table aggregates. `leads` is one capped page, so a KPI derived from
  // it silently stopped being true past 100 leads. Resolved here because the
  // sidebar's "new leads" badge needs it on every tab.
  const { stats: agg } = useLeadStats({ days: 14, months: 6, deltaDays: 7 });
  const stats = agg
    ? {
        total: agg.total,
        new: agg.byStatus.New ?? 0,
        inProgress: (agg.byStatus["In Progress"] ?? 0) + (agg.byStatus.Contacted ?? 0),
        completed: agg.byStatus.Completed ?? 0,
      }
    : {
        total: leads.length,
        new: leads.filter((l) => l.status === "New").length,
        inProgress: leads.filter((l) => l.status === "In Progress" || l.status === "Contacted").length,
        completed: leads.filter((l) => l.status === "Completed").length,
      };

  // Distinguish "still fetching" from "genuinely has no company". Showing the
  // dead-end screen while the profile request is in flight is what made the
  // lockout look permanent even when it was only slow.
  if (apiMode && ownLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 pt-20">
        <Icon name="business_center" className="text-outline text-[64px]" />
        <p className=" text-title text-on-surface">{t(locale, "prov_no_company")}</p>
        <Link to="/" className="text-primary text-label hover:underline flex items-center gap-1">
          <Icon name="arrow_back" className="text-label rtl-flip" /> {t(locale, "prov_back_to_site")}
        </Link>
      </div>
    );
  }

  const topbarTitle = (() => { const cfg = PROVIDER_TABS.find((c) => c.id === tab); return cfg ? t(locale, cfg.labelKey) : ""; })();

  const context: ProviderOutletContext = { company, leads, agg, stats, pricingAllowed };

  return (
    <DashboardShell
      title={topbarTitle}
      topbarActions={isAuthenticated() && (
        <>
          <DashboardRefreshButton onRefresh={() => setRefreshKey((k) => k + 1)} />
          {/* DM-17: label is `hidden sm:inline` below sm — see AdminLayout. */}
          <button onClick={() => logout()} title={t(locale, "prov_sign_out")} aria-label={t(locale, "prov_sign_out")} className="flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 min-h-[44px] rounded-xl font-bold text-label hover:bg-surface-container-high transition-colors touch-press btn-press flex-shrink-0">
            <Icon name="logout" className="text-subhead" /><span className="hidden sm:inline">{t(locale, "prov_sign_out")}</span>
          </button>
        </>
      )}
      renderSidebar={(closeDrawer) => (
        <ProviderSidebarBody
          company={company} companies={companies}
          selectedSlug={selectedSlug} setSelectedSlug={setSelectedSlug}
          tab={tab} newCount={stats.new} onClose={closeDrawer} tabs={tabs}
        />
      )}
      // DM-07: same rationale as admin's — the four tabs a provider actually
      // lives in (new leads, replying to a customer, toggling availability)
      // otherwise cost a hamburger tap same as Settings does. `newCount`
      // reuses the exact badge the sidebar already shows on Leads; Messages
      // and Availability get none because the sidebar doesn't have one for
      // them either — matching what's already there, not inventing a new
      // unread-count fetch this phase has no reason to add.
      bottomNav={
        <BottomNav
          ariaLabel={t(locale, "nav_bottom_quick")}
          items={[
            { to: "/provider/overview", label: t(locale, "prov_tab_overview"), icon: "dashboard" },
            { to: "/provider/leads", label: t(locale, "prov_tab_leads"), icon: "inbox", badge: stats.new },
            { to: "/provider/messages", label: t(locale, "prov_tab_messages"), icon: "forum" },
            { to: "/provider/availability", label: t(locale, "prov_tab_availability"), icon: "event_busy" },
          ]}
        />
      }
    >
      {/* Own Suspense boundary so switching tabs shows a lightweight fallback
          within the shell (sidebar + topbar stay put) instead of a blank
          screen while that tab's chunk loads. */}
      <Suspense fallback={<TabFallback />}>
        <div key={`${location.pathname}-${refreshKey}`} className="page-enter">
          <Outlet context={context} />
        </div>
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
 * The `/provider` index route, and the back-compat landing spot for the old
 * `?tab=` deep-link shape. Those links are NOT merely historical: the server
 * still builds `/provider?tab=messages` into chat push-notification payloads
 * (see sw.js and the notification service), so dropping the parameter would
 * silently break every existing notification.
 */
export function ProviderIndexRedirect() {
  const [params] = useSearchParams();
  const requested = params.get("tab");
  const target = requested && isProviderTab(requested) ? requested : "overview";
  return <Navigate to={target} replace />;
}

function ProviderSidebarBody({
  company, companies, selectedSlug, setSelectedSlug, tab, newCount, onClose, tabs,
}: {
  company: Company; companies: Company[]; selectedSlug: string; setSelectedSlug: (s: string) => void;
  tab: ProviderTab; newCount: number; onClose?: () => void;
  tabs: typeof PROVIDER_TABS;
}) {
  const { locale } = useLocale();
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-outline-variant/15">
        <Link to="/" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
          <Logo className="h-11 w-11 object-contain rounded-xl flex-shrink-0" width={44} height={44} />
          <div className="min-w-0">
            <p className="font-display font-black text-subhead text-on-surface leading-none truncate">{t(locale, "brand_name")}</p>
            <p className="text-caption font-bold text-secondary ltr:tracking-wide mt-1.5 flex items-center gap-1">
              <Icon name="storefront" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
              {t(locale, "prov_portal_label")}
            </p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden w-11 h-11 -m-1.5 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label={t(locale, "nav_close_menu")}>
            <Icon name="close" className="text-outline" />
          </button>
        )}
      </div>

      {/* Company selector */}
      <div className="px-4 py-4 border-b border-outline-variant/15">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-outline-variant/20 bg-white flex-shrink-0">
            <img src={company.logo} alt={company.name} className="w-full h-full object-cover" width={40} height={40} />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-label text-on-surface truncate">{company.name}</p>
            <p className="text-caption text-outline truncate">{company.categoryLabel}</p>
          </div>
        </div>
        {companies.length > 1 && (
          <Select
            value={selectedSlug}
            onChange={setSelectedSlug}
            ariaLabel={t(locale, "prov_portal_label")}
            options={companies.map((c) => ({ value: c.slug, label: c.name }))}
          />
        )}
      </div>

      {/* linkTo, not onSelect: each tab is a real route now (DM-02), so these
          are links — middle-clickable, and the drawer closes via onNavigate. */}
      <SidebarNav
        items={tabs.map((item) => ({
          id: item.id,
          icon: item.icon,
          label: t(locale, item.labelKey),
          badge: item.id === "leads" ? newCount : undefined,
        }))}
        activeId={tab}
        linkTo={(id) => `/provider/${id}`}
        onNavigate={onClose}
      />

      <div className="p-4 border-t border-outline-variant/15 space-y-1">
        <Link to="/" className="flex items-center gap-2 px-2 py-2 min-h-[44px] text-label font-bold text-outline hover:text-on-surface transition-colors">
          <Icon name="arrow_back" className="text-subhead rtl-flip" /> {t(locale, "prov_back_to_site_link")}
        </Link>
      </div>
    </>
  );
}
