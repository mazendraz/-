import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLeadsForCompany, updateLeadStatus, type Lead, type LeadStatus, LEAD_STATUSES, LEAD_STATUS_KEYS, STATUS_COLORS } from "../lib/requests";
import { isApiConfigured } from "../lib/api";
import { listMyProjects, createMyProject, updateMyProject, deleteMyProject, type ProjectInput } from "../lib/projects";
import { uploadImage } from "../lib/image";
import type { Project } from "../lib/data";
import Pagination from "../components/Pagination";
import { useServerSearch } from "../hooks/useServerSearch";
import { useMutation } from "../hooks/useMutation";
import { useCompanies, useCompanyDetail, useMyCompany, type Company, type Review } from "../lib/catalog";
import { logout, isAuthenticated } from "../lib/auth";
import {
  leadsPerDay, leadsPerMonth, leadsByStatus, conversionFunnel, periodDelta,
  statsPerDay, statsPerMonth, statsByStatus, statsFunnel, statsDelta, statsConversion,
} from "../lib/analytics";
import { useLeadStats } from "../lib/stats";
import {
  KpiCard, ChartCard, AreaLineChart, DonutChart, FunnelChart, BarChart,
} from "../components/Charts";
import SearchInput from "../components/SearchInput";
import Logo from "../components/Logo";
import DashboardShell from "../components/DashboardShell";
import SidebarNav from "../components/SidebarNav";
import NotificationToggle from "../components/NotificationToggle";
import ProfileEditor from "../components/ProfileEditor";
import OfferingsEditor from "../components/OfferingsEditor";
import TelegramConnect from "../components/TelegramConnect";
import AvailabilityControl from "../components/AvailabilityControl";
import BusyWindowsEditor from "../components/BusyWindowsEditor";
import ProviderChat from "../components/ProviderChat";
import WaitlistManager from "../components/WaitlistManager";
import {
  setMyAvailability, isBusy, formatReopenDate, availableAgainAt,
  setWaitlistStatus, deleteWaitlistEntry,
  WAITLIST_STATUSES, WAITLIST_STATUS_KEYS, WAITLIST_STATUS_COLORS,
  type WaitlistEntry, type WaitlistStatus,
} from "../lib/availability";
import { useLocale } from "../context/LocaleContext";
import { t, tCount, type StringKey } from "../lib/i18n";
import { formatDate } from "../lib/format";
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";
import { CHART_COLORS } from "../lib/chartColors";

type ProviderTab = "overview" | "leads" | "messages" | "projects" | "pricing" | "reviews" | "analytics" | "availability" | "profile" | "settings";

const TAB_CONFIG: { id: ProviderTab; icon: string; labelKey: StringKey }[] = [
  { id: "overview", icon: "dashboard", labelKey: "prov_tab_overview" },
  { id: "leads", icon: "inbox", labelKey: "prov_tab_leads" },
  { id: "messages", icon: "forum", labelKey: "prov_tab_messages" },
  { id: "projects", icon: "photo_library", labelKey: "prov_tab_projects" },
  { id: "reviews", icon: "star", labelKey: "prov_tab_reviews" },
  { id: "analytics", icon: "bar_chart", labelKey: "prov_tab_analytics" },
  { id: "availability", icon: "event_busy", labelKey: "prov_tab_availability" },
  { id: "pricing", icon: "sell", labelKey: "prov_tab_pricing" },
  { id: "profile", icon: "business", labelKey: "prov_tab_profile" },
  { id: "settings", icon: "settings", labelKey: "prov_tab_settings" },
];

/**
 * One row in the merged Leads view — a real lead or a waiting-list join that
 * joined while the company was busy. Tagged so LeadRows can render each with its
 * own status vocabulary/color while sharing one list and one sort order.
 */
type LeadListRow =
  | { kind: "lead"; data: Lead }
  | { kind: "waitlist"; data: WaitlistEntry };

export default function ProviderDashboard() {
  const { locale } = useLocale();
  const [params] = useSearchParams();
  const companyParam = params.get("company") ?? "";
  const apiMode = isApiConfigured();

  // The provider's own company comes from /provider/profile — scoped to their
  // companyId server-side, so it resolves regardless of company status and no
  // matter how large the platform gets. Reading it out of the public catalog
  // (ACTIVE-only, first 100 rows) is what used to lock providers out entirely.
  const { company: ownCompany, loading: ownLoading } = useMyCompany();

  // Demo mode only (no API, no session): pick from the local catalog.
  const allCompanies = useCompanies();
  const [selectedSlug, setSelectedSlug] = useState(companyParam);
  // Derived, not a useState initializer: on a cold cache allCompanies is empty
  // on first render, and an initializer would have frozen "" forever.
  const demoSlug = selectedSlug || allCompanies[0]?.slug || "";
  const demoDetail = useCompanyDetail(apiMode ? "" : demoSlug);

  // `?tab=messages` deep-links a chat push notification straight to the
  // Messages tab — read once on load, same as `company` above.
  const [tab, setTab] = useState<ProviderTab>(() => {
    const requested = params.get("tab");
    return TAB_CONFIG.some((c) => c.id === requested) ? (requested as ProviderTab) : "overview";
  });

  // List search / filter state
  const [leadQuery, setLeadQuery] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus | "All" | "Waitlist">("All");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewRating, setReviewRating] = useState(0);

  const company = apiMode ? ownCompany : demoDetail.company;
  const effectiveSlug = company?.slug ?? "";
  const COMPANIES = apiMode ? (company ? [company] : []) : allCompanies;
  const leads = useLeadsForCompany(effectiveSlug);

  // Phase 9 — the Pricing tab only exists for a company whose category has
  // opted into a fixed catalog. Filtering TAB_CONFIG (rather than hiding the
  // rendered content only) keeps the sidebar nav, the top-bar title lookup and
  // the deep-link guard below reading from one source of truth.
  const pricingAllowed = company?.categoryPricingMode === "FIXED_CATALOG";
  const tabs = TAB_CONFIG.filter((tb) => tb.id !== "pricing" || pricingAllowed);
  // Rare but real: an admin can flip a category off while this provider
  // already has the Pricing tab open — snap back to overview rather than
  // leaving them on a pane that just vanished from the sidebar. Must run
  // before the early returns below, same as the other hooks here. A deep link
  // that never had access to begin with is a different case, handled where
  // "pricing" is rendered further down (an EmptyState, not a silent redirect —
  // arriving via a real link deserves an explanation, not a bounce).
  const wasPricingAllowed = useRef(pricingAllowed);
  useEffect(() => {
    if (wasPricingAllowed.current && !pricingAllowed && tab === "pricing") setTab("overview");
    wasPricingAllowed.current = pricingAllowed;
  }, [pricingAllowed, tab]);

  // Leads: server-driven search/pagination over the provider's COMPLETE lead set
  // when the API is configured (the endpoint is auto-scoped to their own company);
  // the in-memory filter further down is the demo-mode (localStorage) path. This
  // hook must run before the `if (!company)` early return below (rules of hooks).
  const leadApiMode = apiMode;
  // A specific Lead status only ever matches leads (a waitlist join has no Lead
  // status); "Waitlist" only ever matches waitlist entries — each source is only
  // fetched when it can actually contribute rows to the current filter.
  const showLeads = leadStatus !== "Waitlist";
  const showWaitlist = leadStatus === "All" || leadStatus === "Waitlist";
  const leadSearch = useServerSearch<Lead>(
    "/provider/leads",
    leadQuery,
    { status: showLeads && leadStatus !== "All" ? leadStatus : undefined },
    { pageSize: 20, enabled: leadApiMode && showLeads },
  );
  // The provider's own waiting-list joins — merged into the same Leads tab,
  // tagged and colored differently (see LeadListRow/LeadRows below). Pagination
  // stays driven by leadSearch when both are shown together: real volume here is
  // small (it only accumulates while the company is busy), so a perfectly
  // unified cross-source sort isn't worth the complexity.
  const waitlistSearch = useServerSearch<WaitlistEntry>(
    "/provider/waitlist",
    leadQuery,
    {},
    { pageSize: 20, enabled: leadApiMode && showWaitlist },
  );
  // UX-06: fire-and-forget before — a failed PATCH was swallowed with no
  // pending state, no error, no rollback.
  const leadStatusMutation = useMutation<{ id: string; status: LeadStatus }>({
    mutate: ({ id, status }) => updateLeadStatus(id, status),
    onSuccess: () => { if (leadApiMode) leadSearch.refresh(); },
    errorMessage: t(locale, "admin_mutation_failed"),
  });
  const waitlistStatusMutation = useMutation<{ entry: WaitlistEntry; status: WaitlistStatus }>({
    mutate: ({ entry, status }) => setWaitlistStatus({ kind: "provider" }, entry.id, status),
    // Accepting (status -> CONVERTED) creates a real Lead behind this entry (see
    // waitlist.service.ts convertToLead) — refresh the lead list too, so the row
    // that was tagged "waitlist" reappears immediately as a normal lead instead of
    // only showing up after the next full reload.
    onSuccess: ({ status }) => {
      waitlistSearch.refresh();
      if (status === "CONVERTED" && leadApiMode) leadSearch.refresh();
    },
    errorMessage: t(locale, "admin_mutation_failed"),
  });
  const waitlistDeleteMutation = useMutation<WaitlistEntry>({
    mutate: (entry) => deleteWaitlistEntry({ kind: "provider" }, entry.id),
    onSuccess: () => waitlistSearch.refresh(),
    errorMessage: t(locale, "admin_delete_failed"),
  });
  const handleLeadStatus = (id: string, status: LeadStatus) => { void leadStatusMutation.run({ id, status }); };
  const handleWaitlistStatus = (entry: WaitlistEntry, status: WaitlistStatus) => { void waitlistStatusMutation.run({ entry, status }); };
  const handleWaitlistDelete = (entry: WaitlistEntry) => { void waitlistDeleteMutation.run(entry); };

  // Reviews: server-driven search/pagination over the COMPLETE review history
  // (the company-detail payload only carries the 50 newest). Demo mode falls back
  // to the client filter over company.reviews. Must run before the early return.
  const reviewSearch = useServerSearch<Review>(
    `/companies/${effectiveSlug}/reviews`,
    reviewQuery,
    { rating: reviewRating || undefined },
    { pageSize: 12, enabled: leadApiMode && !!effectiveSlug },
  );

  // Whole-table aggregates. `leads` is one capped page (pageSize=100), so every
  // KPI, chart and funnel derived from it silently stopped being true past 100
  // leads — while the Leads tab, which paginates server-side, showed the truth.
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

  const daily = agg ? statsPerDay(agg, locale) : leadsPerDay(leads, 14, locale);
  const byStatus = agg ? statsByStatus(agg, locale) : leadsByStatus(leads, locale);
  const funnel = agg ? statsFunnel(agg, locale) : conversionFunnel(leads, locale);
  const monthly = agg ? statsPerMonth(agg, locale) : leadsPerMonth(leads, 6, locale);
  const delta = agg ? statsDelta(agg) : periodDelta(leads, 7);
  const conversion = agg ? statsConversion(agg) : (stats.total ? Math.round((stats.completed / stats.total) * 100) : 0);

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

  const busyNow = isBusy(company);
  // Resolved across the manual switch AND any running scheduled window, so a
  // provider busy because of a scheduled period still sees their return date.
  const backAt = availableAgainAt(company);

  // ── Filtered lists ──
  const lq = leadQuery.trim().toLowerCase();
  const filteredLeads = leads.filter((l) => {
    const matchStatus = leadStatus === "All" || l.status === leadStatus;
    const matchQuery = !lq || [l.name, l.phone, l.refNumber, l.service, l.district].some((v) => v.toLowerCase().includes(lq));
    return matchStatus && matchQuery;
  });
  // Server page in API mode, client-filtered list in demo mode. Demo mode (no
  // API) has no waitlist data source, so it only ever shows leads.
  const leadList = leadApiMode ? leadSearch.data : filteredLeads;
  const leadTotal = leadApiMode ? leadSearch.total : filteredLeads.length;
  const waitlistList = leadApiMode ? waitlistSearch.data : [];
  const waitlistTotal = leadApiMode ? waitlistSearch.total : 0;

  const leadRows: LeadListRow[] = leadList.map((data) => ({ kind: "lead", data }) as const);
  // Converted entries already have their own row in leadRows (the Lead they became
  // — see convertToLead) — keep them out of the merged pipeline view so the same
  // customer doesn't appear twice. Still visible, including Converted, from
  // WaitlistManager's own status filter (Availability tab).
  const waitlistRows: LeadListRow[] = waitlistList
    .filter((e) => e.status !== "CONVERTED")
    .map((data) => ({ kind: "waitlist", data }) as const);
  const mergedRows: LeadListRow[] = showLeads && showWaitlist
    ? [...leadRows, ...waitlistRows].sort((a, b) => b.data.createdAt - a.data.createdAt)
    : showWaitlist ? waitlistRows : leadRows;
  const displayedTotal = showLeads && showWaitlist ? leadTotal + waitlistTotal : showWaitlist ? waitlistTotal : leadTotal;

  const rq = reviewQuery.trim().toLowerCase();
  const filteredReviews = company.reviews.filter((r) => {
    const matchRating = reviewRating === 0 || r.rating === reviewRating;
    const matchQuery = !rq || [r.author, r.text, r.district].some((v) => v.toLowerCase().includes(rq));
    return matchRating && matchQuery;
  });
  const reviewList = leadApiMode ? reviewSearch.data : filteredReviews;
  const reviewTotal = leadApiMode ? reviewSearch.total : filteredReviews.length;

  const LEAD_FILTERS: (LeadStatus | "All" | "Waitlist")[] = ["All", "New", "Contacted", "In Progress", "Completed", "Cancelled", "Waitlist"];

  const topbarTitle = (() => { const cfg = TAB_CONFIG.find((c) => c.id === tab); return cfg ? t(locale, cfg.labelKey) : ""; })();
  const topbarActions = isAuthenticated() && (
    <button onClick={() => logout()} title={t(locale, "prov_sign_out")} className="flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 rounded-xl font-bold text-label hover:bg-surface-container-high transition-colors touch-press btn-press flex-shrink-0">
      <Icon name="logout" className="text-subhead" /><span className="hidden sm:inline">{t(locale, "prov_sign_out")}</span>
    </button>
  );

  return (
    <DashboardShell
      title={topbarTitle}
      topbarActions={topbarActions}
      renderSidebar={(closeDrawer) => (
        <ProviderSidebarBody
          company={company} companies={COMPANIES} selectedSlug={selectedSlug} setSelectedSlug={setSelectedSlug}
          tab={tab} onSelect={(id) => { setTab(id); closeDrawer?.(); }} newCount={stats.new} onClose={closeDrawer} tabs={tabs}
        />
      )}
    >
          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              {/* Availability banner */}
              <button onClick={() => setTab("availability")}
                className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-start transition-colors ${
                  busyNow ? "border-amber-300 bg-amber-50 hover:bg-amber-100/70" : "border-green-300 bg-green-50 hover:bg-green-100/70"
                }`}>
                <span className={`material-symbols-outlined text-headline ${busyNow ? "text-amber-600" : "text-green-600"}`} style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">
                  {busyNow ? "event_busy" : "event_available"}
                </span>
                <div className="min-w-0 flex-grow">
                  <p className="font-bold text-body text-on-surface">{t(locale, busyNow ? "prov_avail_busy_banner" : "prov_avail_free_banner")}</p>
                  <p className="text-caption text-outline">
                    {busyNow
                      ? (backAt
                          ? `${t(locale, "prov_avail_auto_reopen")} ${formatReopenDate(backAt, locale)} · ${t(locale, "prov_avail_waiting_list_note")}`
                          : t(locale, "prov_avail_no_end_waiting"))
                      : t(locale, "prov_avail_normal")}
                  </p>
                </div>
                <Icon name="chevron_right" className="text-outline text-title flex-shrink-0" />
              </button>

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon="inbox" label={t(locale, "prov_kpi_total_leads")} value={stats.total} delta={delta} spark={daily.map((d) => d.value)} tint={CHART_COLORS.primary} />
                <KpiCard icon="fiber_new" label={t(locale, "prov_kpi_new_leads")} value={stats.new} tint={CHART_COLORS.blue} />
                <KpiCard icon="trending_up" label={t(locale, "prov_kpi_conversion")} value={stats.total ? `${conversion}%` : "—"} tint={CHART_COLORS.green} />
                <KpiCard icon="grade" label={t(locale, "prov_kpi_rating")} value={company.rating} tint={CHART_COLORS.secondary} />
              </div>

              {/* Trend + status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title={t(locale, "prov_chart_leads_over_time")} subtitle={t(locale, "prov_chart_last_14")} className="lg:col-span-2"
                  action={<Link to={`/companies/${company.slug}`} target="_blank" className="text-label font-bold text-primary hover:underline flex items-center gap-1">{t(locale, "prov_public_profile")} <Icon name="open_in_new" className="text-label" /></Link>}>
                  <AreaLineChart data={daily} valueLabel={t(locale, "chart_leads")} />
                </ChartCard>
                <ChartCard title={t(locale, "prov_chart_by_status")} subtitle={t(locale, "prov_chart_pipeline")}>
                  <DonutChart data={byStatus} centerValue={stats.total} centerLabel={t(locale, "chart_leads")} />
                </ChartCard>
              </div>

              {/* Recent leads */}
              <ChartCard title={t(locale, "prov_chart_recent_leads")} action={<button onClick={() => setTab("leads")} className="text-label font-bold text-primary hover:underline">{t(locale, "common_view_all")}</button>}>
                {leads.length === 0 ? (
                  <EmptyState msg={t(locale, "prov_overview_empty")} icon="inbox" />
                ) : (
                  // handleLeadStatus, not the raw mutation: it also refreshes the
                  // server-paginated Leads tab, so a status changed here doesn't
                  // leave a stale row behind on the other tab.
                  <LeadRows
                    rows={leads.slice(0, 5).map((data) => ({ kind: "lead", data }) as const)}
                    onLeadStatusChange={handleLeadStatus}
                    onWaitlistStatusChange={handleWaitlistStatus}
                    onWaitlistDelete={handleWaitlistDelete}
                  />
                )}
              </ChartCard>
            </div>
          )}

          {/* ── Leads ── */}
          {tab === "leads" && (
            <div className="space-y-4">
              <SearchInput value={leadQuery} onChange={setLeadQuery} placeholder={t(locale, "prov_leads_search_ph")} />
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {LEAD_FILTERS.map((f) => (
                  <button key={f} onClick={() => setLeadStatus(f)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-label font-bold transition-colors border ${
                      leadStatus === f ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
                    }`}>
                    {f === "All" ? t(locale, "companies_all") : f === "Waitlist" ? t(locale, "requests_filter_waitlist") : t(locale, LEAD_STATUS_KEYS[f])}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-label font-bold text-outline">
                  {displayedTotal} {tCount(locale, "noun_lead", displayedTotal)}
                </span>
                {stats.new > 0 && <span className="bg-blue-100 text-blue-700 text-caption font-bold px-2.5 py-1 rounded-full">{stats.new} {t(locale, "prov_leads_new_badge")}</span>}
              </div>
              {leadApiMode && (leadSearch.error || waitlistSearch.error) && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{leadSearch.error || waitlistSearch.error}</div>
              )}
              <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                {mergedRows.length === 0 ? (
                  leadApiMode && (leadSearch.loading || waitlistSearch.loading) ? (
                    <Loading msg={t(locale, "admin_searching")} />
                  ) : (
                    <EmptyState
                      msg={(lq || leadStatus !== "All") ? t(locale, "prov_leads_no_match") : t(locale, "prov_leads_empty")}
                      icon={(lq || leadStatus !== "All") ? "search_off" : "inbox"}
                    />
                  )
                ) : (
                  <div className={`transition-opacity ${leadApiMode && (leadSearch.loading || waitlistSearch.loading) ? "opacity-60 pointer-events-none" : ""}`} aria-busy={leadApiMode && (leadSearch.loading || waitlistSearch.loading)}>
                    <LeadRows rows={mergedRows} onLeadStatusChange={handleLeadStatus} onWaitlistStatusChange={handleWaitlistStatus} onWaitlistDelete={handleWaitlistDelete} />
                  </div>
                )}
              </div>
              {leadApiMode && (
                showWaitlist && !showLeads
                  ? <Pagination page={waitlistSearch.page} pageCount={waitlistSearch.pageCount} total={waitlistSearch.total} pageSize={waitlistSearch.pageSize} onPage={waitlistSearch.setPage} nounKey="noun_lead" />
                  : <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} nounKey="noun_lead" />
              )}
            </div>
          )}

          {/* ── Projects ── */}
          {tab === "projects" && <ProviderProjectsTab company={company} />}

          {/* ── Reviews ── */}
          {tab === "reviews" && (
            <div>
              <div className="flex items-center gap-4 mb-5">
                <div className="text-3xl font-bold text-primary">{company.rating}</div>
                <div>
                  <div className="flex items-center gap-0.5 mb-0.5">
                    {[1,2,3,4,5].map((i) => (
                      <Icon name="star" className="text-secondary text-body" style={{ fontVariationSettings: i <= Math.round(company.rating) ? "'FILL' 1" : "'FILL' 0" }} key={i} />
                    ))}
                  </div>
                  <p className="text-caption text-outline">{company.reviewCount} {tCount(locale, "noun_review", company.reviewCount)}</p>
                </div>
              </div>

              {/* Search + rating filter */}
              {company.reviewCount > 0 && (
                <div className="space-y-3 mb-5">
                  <div className="max-w-md"><SearchInput value={reviewQuery} onChange={setReviewQuery} placeholder={t(locale, "prov_reviews_search_ph")} /></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <button onClick={() => setReviewRating(0)} className={`px-3.5 py-1.5 rounded-full text-label font-bold border transition-colors ${reviewRating === 0 ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>{t(locale, "companies_all")}</button>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <button key={r} onClick={() => setReviewRating(r)} className={`flex items-center gap-0.5 px-3 py-1.5 rounded-full text-label font-bold border transition-colors ${reviewRating === r ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>
                        {r}<Icon name="star" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                      </button>
                    ))}
                    <span className="text-label font-bold text-outline ms-auto">{reviewTotal} {tCount(locale, "noun_review", reviewTotal)}</span>
                  </div>
                </div>
              )}

              {leadApiMode && reviewSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold mb-4">{reviewSearch.error}</div>
              )}
              {reviewList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
                  {leadApiMode && reviewSearch.loading
                    ? <Loading msg={t(locale, "admin_searching")} />
                    : <EmptyState msg={(rq || reviewRating) ? t(locale, "prov_reviews_no_match") : t(locale, "prov_reviews_empty")} icon="search_off" />}
                </div>
              ) : (
              <>
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-gutter transition-opacity ${leadApiMode && reviewSearch.loading ? "opacity-60 pointer-events-none" : ""}`}
                aria-busy={leadApiMode && reviewSearch.loading}
              >
                {reviewList.map((r, i) => (
                  <div key={`${r.author}-${i}`} className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map((i) => (
                          <Icon name="star" className="text-secondary text-label" style={{ fontVariationSettings: i <= r.rating ? "'FILL' 1" : "'FILL' 0" }} key={i} />
                        ))}
                      </div>
                      {r.verified && (
                        <span className="flex items-center gap-0.5 text-caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full" title={t(locale, "prov_review_verified_title")}>
                          <Icon name="verified" className="text-caption" style={{ fontVariationSettings: "'FILL' 1" }} />
                          {t(locale, "common_verified")}
                        </span>
                      )}
                    </div>
                    <p className="text-body text-on-surface-variant leading-relaxed flex-grow mb-4">"{r.text}"</p>
                    <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/20">
                      <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">{r.avatar}</div>
                      <div>
                        <p className="font-display text-label text-on-surface">{r.author}</p>
                        <p className="text-caption font-display text-outline">{r.district} · {r.date}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {leadApiMode && (
                <Pagination className="mt-6" page={reviewSearch.page} pageCount={reviewSearch.pageCount} total={reviewSearch.total} pageSize={reviewSearch.pageSize} onPage={reviewSearch.setPage} nounKey="noun_review" />
              )}
              </>
              )}
            </div>
          )}

          {/* ── Analytics ── */}
          {tab === "analytics" && (
            // stats.total, not leads.length: the local list is a capped page, and
            // an empty one does not mean there are no leads to analyse.
            stats.total === 0 ? (
              <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-12 text-center max-w-lg mx-auto">
                <Icon name="monitoring" className="text-outline/50 text-[44px] mb-3 block" />
                <h2 className="font-bold text-subhead text-on-surface mb-1">{t(locale, "prov_analytics_empty_title")}</h2>
                <p className="text-label text-outline">{t(locale, "prov_analytics_empty_sub")}</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard icon="trending_up" label={t(locale, "prov_kpi_conversion")} value={`${conversion}%`} tint={CHART_COLORS.green} />
                  <KpiCard icon="grade" label={t(locale, "prov_kpi_rating")} value={`${company.rating}★`} tint={CHART_COLORS.secondary} />
                  <KpiCard icon="reviews" label={t(locale, "prov_kpi_reviews")} value={company.reviewCount} tint={CHART_COLORS.primary} />
                  <KpiCard icon="construction" label={t(locale, "prov_kpi_projects")} value={company.completedProjects} tint={CHART_COLORS.primaryContainer} />
                </div>

                {/* Trend + status donut */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <ChartCard title={t(locale, "prov_chart_leads_over_time")} subtitle={t(locale, "prov_chart_last_14")} className="lg:col-span-2">
                    <AreaLineChart data={daily} valueLabel={t(locale, "chart_leads")} />
                  </ChartCard>
                  <ChartCard title={t(locale, "prov_chart_status_breakdown")}>
                    <DonutChart data={byStatus} centerValue={stats.total} centerLabel={t(locale, "chart_leads")} />
                  </ChartCard>
                </div>

                {/* Funnel + monthly */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title={t(locale, "prov_chart_funnel")} subtitle={t(locale, "prov_chart_funnel_sub")}>
                    <FunnelChart stages={funnel} />
                  </ChartCard>
                  <ChartCard title={t(locale, "prov_chart_monthly")} subtitle={t(locale, "prov_chart_last_6")}>
                    <BarChart data={monthly} />
                  </ChartCard>
                </div>
              </div>
            )
          )}

          {/* ── Availability ── */}
          {tab === "availability" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className=" text-title text-on-surface mb-1">{t(locale, "prov_avail_tab_title")}</h3>
                <p className="text-outline mb-5 text-sm">
                  {t(locale, "prov_avail_tab_desc")}
                </p>
                <AvailabilityControl
                  key={`${company.id}-${company.busy}-${company.busyUntil ?? ""}`}
                  initialBusy={isBusy(company)}
                  initialBusyUntil={company.busyUntil}
                  initialNote={company.busyNote}
                  onSave={setMyAvailability}
                />
                {/* Scheduling, under the manual switch. These take effect and
                    expire on their own — the server derives availability on read. */}
                <BusyWindowsEditor />
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <WaitlistManager scope={{ kind: "provider" }} />
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          {tab === "messages" && <ProviderChat />}

          {/* ── Services & pricing ── */}
          {tab === "pricing" && (
            pricingAllowed
              ? <OfferingsEditor />
              // Reached only via a deep link (?tab=pricing) to a company whose
              // category isn't FIXED_CATALOG — the sidebar never offers this
              // tab in that case. An explanation, not a blank pane or a silent
              // bounce: the provider followed a real link here.
              : <EmptyState msg={t(locale, "prov_pricing_unavailable")} icon="sell" />
          )}

          {/* ── Profile ── */}
          {tab === "profile" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                <div className="relative h-36 overflow-hidden">
                  <img src={company.cover} alt={company.name} className="w-full h-full object-cover" width={672} height={144} />
                </div>
                <div className="px-6 pb-6">
                  <div className="-mt-8 mb-4 w-16 h-16 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-white">
                    <img src={company.logo} alt={t(locale, "common_logo_alt")} className="w-full h-full object-cover" width={64} height={64} />
                  </div>
                  <h2 className="font-display text-title text-on-surface mb-1">{company.name}</h2>
                  <p className="text-label font-display text-outline mb-3">{company.categoryLabel}</p>
                  <p className="text-body text-on-surface-variant leading-relaxed">{company.about}</p>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                <h3 className=" text-title text-on-surface mb-4">{t(locale, "prov_profile_services")}</h3>
                <div className="flex flex-wrap gap-2">
                  {company.services.map((s) => (
                    <span key={s} className="bg-surface-container px-3 py-1.5 rounded-full text-label font-display text-on-surface-variant border border-outline-variant/20">{s}</span>
                  ))}
                </div>
              </div>

              {/* Editable profile — every save files a change request for admin
                  review; the public profile is untouched until it's approved. */}
              <ProfileEditor />
            </div>
          )}

          {/* ── Settings ── */}
          {tab === "settings" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className=" text-title text-on-surface mb-2">{t(locale, "prov_settings_notifications")}</h3>
                <p className="text-outline mb-4 text-sm">{t(locale, "prov_settings_notifications_sub")}</p>
                <div className="py-3 border-b border-outline-variant/20">
                  <NotificationToggle />
                </div>
                <div className="py-3 border-b border-outline-variant/20">
                  <TelegramConnect />
                </div>
                {[
                  { labelKey: "prov_settings_email_label" as StringKey, detailKey: "prov_settings_email_detail" as StringKey },
                  { labelKey: "prov_settings_sms_label" as StringKey, detailKey: "prov_settings_sms_detail" as StringKey },
                  { labelKey: "prov_settings_weekly_label" as StringKey, detailKey: "prov_settings_weekly_detail" as StringKey },
                ].map((s) => (
                  <div key={t(locale, s.labelKey)} className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0">
                    <div>
                      <p className=" text-label text-on-surface">{t(locale, s.labelKey)}</p>
                      <p className="text-caption text-outline">{t(locale, s.detailKey)}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ms-4">
                      <input type="checkbox" role="switch" aria-label={t(locale, s.labelKey)} defaultChecked className="sr-only peer" />
                      <div className="w-10 h-6 bg-outline-variant peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4 peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className=" text-title text-on-surface mb-4">{t(locale, "prov_settings_account")}</h3>
                <p className="text-outline text-sm">
                  {t(locale, "prov_account_note")}
                </p>
              </div>
            </div>
          )}
    </DashboardShell>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function LeadRows({ rows, onLeadStatusChange, onWaitlistStatusChange, onWaitlistDelete }: {
  rows: LeadListRow[];
  onLeadStatusChange: (id: string, s: LeadStatus) => void;
  onWaitlistStatusChange: (entry: WaitlistEntry, s: WaitlistStatus) => void;
  onWaitlistDelete: (entry: WaitlistEntry) => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="divide-y divide-outline-variant/10">
      {rows.map((row) => row.kind === "waitlist" ? (
        <div key={`w-${row.data.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="flex items-center gap-1 text-caption font-bold text-amber-700">
                <Icon name="hourglass_top" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                {t(locale, "common_kind_waitlist")}
              </span>
              <span className={`text-caption px-2 py-0.5 rounded-full ${WAITLIST_STATUS_COLORS[row.data.status]}`}>{t(locale, WAITLIST_STATUS_KEYS[row.data.status])}</span>
            </div>
            <p className=" text-label text-on-surface">{row.data.name} — {row.data.phone}</p>
            <p className="text-caption text-outline">{row.data.service ?? ""}</p>
            {row.data.note && (
              <p className="text-on-surface-variant text-sm mt-1 line-clamp-2">{row.data.note}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <select
                value={row.data.status}
                onChange={(e) => onWaitlistStatusChange(row.data, e.target.value as WaitlistStatus)}
                className="border border-outline-variant rounded-lg px-2.5 py-1 text-caption text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none"
              >
                {WAITLIST_STATUSES.map((s) => <option key={s} value={s}>{t(locale, WAITLIST_STATUS_KEYS[s])}</option>)}
              </select>
              <button onClick={() => onWaitlistDelete(row.data)} title={t(locale, "prov_wl_remove")}
                className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors">
                <Icon name="delete" className="text-subhead" />
              </button>
            </div>
            <span className="text-caption text-outline">{formatDate(row.data.createdAt, locale)}</span>
          </div>
        </div>
      ) : (
        <div key={`l-${row.data.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-mono text-caption text-primary">{row.data.refNumber}</span>
              <span className={`text-caption px-2 py-0.5 rounded-full ${STATUS_COLORS[row.data.status]}`}>{t(locale, LEAD_STATUS_KEYS[row.data.status])}</span>
            </div>
            <p className=" text-label text-on-surface">{row.data.name} — {row.data.phone}</p>
            <p className="text-caption text-outline">{row.data.service} · {row.data.district} · {row.data.budget}</p>
            {row.data.description && (
              <p className="text-on-surface-variant text-sm mt-1 line-clamp-2">{row.data.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <select
              value={row.data.status}
              onChange={(e) => onLeadStatusChange(row.data.id, e.target.value as LeadStatus)}
              className="border border-outline-variant rounded-lg px-2.5 py-1 text-caption text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none"
            >
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
            </select>
            <span className="text-caption text-outline">{formatDate(row.data.createdAt, locale)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Status pill shown on each provider project card.
const PROJECT_STATUS_BADGE: Record<string, { labelKey: StringKey; cls: string; icon: string }> = {
  PENDING: { labelKey: "prov_proj_status_pending" as StringKey, cls: "bg-amber-100 text-amber-800", icon: "hourglass_top" },
  APPROVED: { labelKey: "prov_proj_status_approved" as StringKey, cls: "bg-green-100 text-green-800", icon: "check_circle" },
  REJECTED: { labelKey: "prov_proj_status_rejected" as StringKey, cls: "bg-error/10 text-error", icon: "cancel" },
};

// Provider portfolio management. Providers build their own projects; each new or
// edited project is submitted for admin approval before it shows on the public
// profile. Demo mode (no API) stays read-only.
function ProviderProjectsTab({ company }: { company: Company }) {
  const { locale } = useLocale();
  const apiMode = isApiConfigured();
  const [projects, setProjects] = useState<Project[]>(company.projects);
  const [loading, setLoading] = useState(apiMode);
  // The translation KEY, resolved at render — calling t() inside the callback
  // captured the language it was built with, and adding `locale` to the deps
  // would refetch the project list on every language toggle.
  const [errorKey, setErrorKey] = useState<StringKey | null>(null);
  const error = errorKey ? t(locale, errorKey) : "";
  const [editing, setEditing] = useState<{ project: Project | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!apiMode) { setProjects(company.projects); setLoading(false); return; }
    setLoading(true); setErrorKey(null);
    try { setProjects(await listMyProjects()); }
    catch { setErrorKey("prov_proj_err_load"); }
    finally { setLoading(false); }
  }, [apiMode, company.projects]);

  useEffect(() => { void reload(); }, [reload]);

  async function handleDelete(p: Project) {
    if (!p.id) return;
    setBusyId(p.id); setErrorKey(null);
    try { await deleteMyProject(p.id); await reload(); }
    catch { setErrorKey("prov_proj_err_delete"); }
    // finally, not just the catch: clearing it only on failure left the flag set
    // for a row that no longer exists, so a later project reusing that position
    // rendered with a spinner and disabled buttons it never earned.
    finally { setBusyId(null); }
  }

  // Demo mode (no API): keep the old read-only view.
  if (!apiMode) {
    return (
      <div className="space-y-4">
        {company.projects.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, "prov_proj_empty")} icon="photo_library" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            {company.projects.map((p) => (
              <div key={p.title} className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                <div className="relative h-48 overflow-hidden">
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover" width={400} height={192} />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-caption font-display px-2 py-0.5 rounded-full">{p.year}</div>
                </div>
                <div className="p-4">
                  <h3 className="font-display text-title text-on-surface mb-1">{p.title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="bg-surface-container-lowest rounded-2xl p-6 text-center shadow-bloom">
          <p className="text-body text-outline">{t(locale, "prov_proj_needs_api")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-body text-on-surface">{t(locale, "prov_proj_title")}</h2>
          <p className="text-caption text-outline mt-0.5 max-w-md leading-relaxed">
            {t(locale, "prov_proj_desc")}
          </p>
        </div>
        <button onClick={() => setEditing({ project: null })}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press flex-shrink-0">
          <Icon name="add_photo_alternate" className="text-subhead" /> {t(locale, "prov_proj_add")}
        </button>
      </div>

      {error && <p className="text-label text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading && projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center text-label text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> {t(locale, "prov_proj_loading")}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, "prov_proj_empty_add")} icon="photo_library" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          {projects.map((p) => {
            const badge = PROJECT_STATUS_BADGE[p.status ?? "APPROVED"] ?? PROJECT_STATUS_BADGE.APPROVED;
            return (
              <div key={p.id ?? p.title} className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom flex flex-col">
                <div className="relative h-44 overflow-hidden">
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover" width={400} height={176} />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-caption font-bold px-2 py-0.5 rounded-full">{p.year}</div>
                  <span className={`absolute top-2 left-2 flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                    <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{badge.icon}</span>{t(locale, badge.labelKey)}
                  </span>
                </div>
                <div className="p-4 flex flex-col flex-grow">
                  <h3 className="font-bold text-body text-on-surface mb-1">{p.title}</h3>
                  <p className="text-label text-on-surface-variant leading-relaxed line-clamp-3 flex-grow">{p.description}</p>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                    <button onClick={() => setEditing({ project: p })} disabled={busyId === p.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-surface-container py-2 rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-60">
                      <Icon name="edit" className="text-label" /> {t(locale, "prov_proj_edit_btn")}
                    </button>
                    <button onClick={() => handleDelete(p)} disabled={busyId === p.id}
                      className="flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors px-3 py-2 text-caption disabled:opacity-60">
                      <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{busyId === p.id ? "progress_activity" : "delete"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ProjectEditorModal
          project={editing.project}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
        />
      )}
    </div>
  );
}

function ProjectEditorModal({ project, onClose, onSaved }: {
  project: Project | null; onClose: () => void; onSaved: () => void;
}) {
  const { locale } = useLocale();
  const isNew = !project;
  const [title, setTitle] = useState(project?.title ?? "");
  const [year, setYear] = useState(project?.year ?? String(new Date().getFullYear()));
  const [description, setDescription] = useState(project?.description ?? "");
  const [img, setImg] = useState(project?.img ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true); setError("");
    try { setImg(await uploadImage(f, "projects", 1600, "/provider/upload")); }
    catch (err) { setError(err instanceof Error ? err.message : t(locale, "prov_proj_err_upload")); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function save() {
    if (title.trim().length < 1) { setError(t(locale, "prov_proj_err_title")); return; }
    if (!img) { setError(t(locale, "prov_proj_err_image")); return; }
    if (!year.trim()) { setError(t(locale, "prov_proj_err_year")); return; }
    setSaving(true); setError("");
    const input: ProjectInput = { title: title.trim(), img, description: description.trim(), year: year.trim() };
    try {
      if (project?.id) await updateMyProject(project.id, input);
      else await createMyProject(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "prov_proj_err_save"));
      setSaving(false);
    }
  }

  const wasApproved = project?.status === "APPROVED";

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container-lowest w-full max-w-lg sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-subhead text-on-surface">{t(locale, isNew ? "prov_proj_add" : "prov_proj_edit")}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><Icon name="close" className="text-outline" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_image")}</label>
            <div onClick={() => fileRef.current?.click()}
              className="relative h-44 w-full rounded-xl border-2 border-dashed border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40 flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors">
              {uploading ? <span className="spinner spinner-primary" />
                : img ? <img src={img} alt="" className="w-full h-full object-cover" width={450} height={176} />
                : (<><Icon name="cloud_upload" className="text-outline/60 text-headline" />
                    <p className="text-caption font-bold text-outline mt-1">{t(locale, "prov_upload_drop")} <span className="text-primary">{t(locale, "prov_upload_browse")}</span></p></>)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_field_title")}</label>
              <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(locale, "prov_proj_title_ph")} />
            </div>
            <div>
              <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_year")}</label>
              <input className="field-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder={t(locale, "prov_proj_year_ph")} />
            </div>
          </div>
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_description")}</label>
            <textarea className="field-input resize-y" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t(locale, "prov_proj_description_ph")} />
          </div>

          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-xl px-3 py-2.5 text-caption font-medium">
            <Icon name="info" className="text-subhead flex-shrink-0" />
            <span>{wasApproved
              ? t(locale, "prov_proj_note_edit")
              : t(locale, "prov_proj_note_new")}</span>
          </div>

          {error && <p className="text-label text-error font-bold">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-outline-variant/20 sticky bottom-0 bg-surface-container-lowest">
          <button onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-label text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">{t(locale, "prov_proj_cancel")}</button>
          <button onClick={save} disabled={saving || uploading}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <Icon name="progress_activity" className="text-subhead animate-spin" />}
            {saving ? t(locale, "prov_proj_submitting") : t(locale, isNew ? "prov_proj_submit" : "prov_proj_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** In-flight state — visually distinct from EmptyState (CMP-02): a spinner,
 * never the "no results" icon, so a still-loading list can't be read as
 * "nothing found" while data is on the way. */
function Loading({ msg }: { msg: string }) {
  return (
    <div className="text-center py-14 px-6">
      <span className="spinner spinner-primary mx-auto mb-3 block" />
      <p className="text-subhead text-outline max-w-sm mx-auto">{msg}</p>
    </div>
  );
}

// ── Sidebar / drawer body (shared by desktop rail and mobile drawer) ──
function ProviderSidebarBody({
  company, companies, selectedSlug, setSelectedSlug, tab, onSelect, newCount, onClose, tabs,
}: {
  company: Company; companies: Company[]; selectedSlug: string; setSelectedSlug: (s: string) => void;
  tab: ProviderTab; onSelect: (id: ProviderTab) => void; newCount: number; onClose?: () => void;
  tabs: typeof TAB_CONFIG;
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
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label={t(locale, "nav_close_menu")}>
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
          <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full border border-outline-variant rounded-lg px-2.5 py-2 text-label text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none">
            {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        )}
      </div>

      <SidebarNav
        items={tabs.map((item) => ({
          id: item.id,
          icon: item.icon,
          label: t(locale, item.labelKey),
          badge: item.id === "leads" ? newCount : undefined,
        }))}
        activeId={tab}
        onSelect={onSelect}
      />

      <div className="p-4 border-t border-outline-variant/15 space-y-1">
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-label font-bold text-outline hover:text-on-surface transition-colors">
          <Icon name="arrow_back" className="text-subhead rtl-flip" /> {t(locale, "prov_back_to_site_link")}
        </Link>
      </div>
    </>
  );
}
