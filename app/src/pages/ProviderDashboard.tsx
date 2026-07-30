import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLeadsForCompany, updateLeadStatus, type Lead, type LeadStatus, LEAD_STATUSES, LEAD_STATUS_KEYS, STATUS_COLORS } from "../lib/requests";
import { isApiConfigured } from "../lib/api";
import { listMyProjects, createMyProject, updateMyProject, deleteMyProject, type ProjectInput } from "../lib/projects";
import { uploadImage } from "../lib/image";
import type { Project } from "../lib/data";
import Pagination from "../components/Pagination";
import { useServerSearch } from "../hooks/useServerSearch";
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
import NotificationToggle from "../components/NotificationToggle";
import ProfileEditor from "../components/ProfileEditor";
import OfferingsEditor from "../components/OfferingsEditor";
import TelegramConnect from "../components/TelegramConnect";
import AvailabilityControl from "../components/AvailabilityControl";
import BusyWindowsEditor from "../components/BusyWindowsEditor";
import ProviderChat from "../components/ProviderChat";
import WaitlistManager from "../components/WaitlistManager";
import { setMyAvailability, isBusy, formatReopenDate, availableAgainAt } from "../lib/availability";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import { formatDate } from "../lib/format";

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

  const [tab, setTab] = useState<ProviderTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // List search / filter state
  const [leadQuery, setLeadQuery] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus | "All">("All");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewRating, setReviewRating] = useState(0);

  const company = apiMode ? ownCompany : demoDetail.company;
  const effectiveSlug = company?.slug ?? "";
  const COMPANIES = apiMode ? (company ? [company] : []) : allCompanies;
  const leads = useLeadsForCompany(effectiveSlug);

  // Leads: server-driven search/pagination over the provider's COMPLETE lead set
  // when the API is configured (the endpoint is auto-scoped to their own company);
  // the in-memory filter further down is the demo-mode (localStorage) path. This
  // hook must run before the `if (!company)` early return below (rules of hooks).
  const leadApiMode = apiMode;
  const leadSearch = useServerSearch<Lead>(
    "/provider/leads",
    leadQuery,
    { status: leadStatus === "All" ? undefined : leadStatus },
    { pageSize: 20, enabled: leadApiMode },
  );
  const handleLeadStatus = (id: string, status: LeadStatus) => {
    void updateLeadStatus(id, status).then(() => { if (leadApiMode) leadSearch.refresh(); });
  };

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
        <span className="material-symbols-outlined text-outline text-[64px]">business_center</span>
        <p className="font-headline-md text-headline-md text-on-surface">{t(locale, "prov_no_company")}</p>
        <Link to="/" className="text-primary font-label-md text-label-md hover:underline">← {t(locale, "prov_back_to_site")}</Link>
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
  // Server page in API mode, client-filtered list in demo mode.
  const leadList = leadApiMode ? leadSearch.data : filteredLeads;
  const leadTotal = leadApiMode ? leadSearch.total : filteredLeads.length;


  const rq = reviewQuery.trim().toLowerCase();
  const filteredReviews = company.reviews.filter((r) => {
    const matchRating = reviewRating === 0 || r.rating === reviewRating;
    const matchQuery = !rq || [r.author, r.text, r.district].some((v) => v.toLowerCase().includes(rq));
    return matchRating && matchQuery;
  });
  const reviewList = leadApiMode ? reviewSearch.data : filteredReviews;
  const reviewTotal = leadApiMode ? reviewSearch.total : filteredReviews.length;

  const LEAD_FILTERS: (LeadStatus | "All")[] = ["All", "New", "Contacted", "In Progress", "Completed", "Cancelled"];

  return (
    <div className="min-h-screen bg-surface-container flex">
      {/* Sidebar (desktop) */}
      <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant/15 flex flex-col min-h-screen hidden md:flex sticky top-0 h-screen">
        <ProviderSidebarBody
          company={company} companies={COMPANIES} selectedSlug={selectedSlug} setSelectedSlug={setSelectedSlug}
          tab={tab} onSelect={setTab} newCount={stats.new}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[70]" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-on-background/45 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="drawer-left absolute top-0 left-0 h-full w-72 max-w-[84vw] bg-surface-container-lowest shadow-2xl flex flex-col">
            <ProviderSidebarBody
              company={company} companies={COMPANIES} selectedSlug={selectedSlug} setSelectedSlug={setSelectedSlug}
              tab={tab} onSelect={(id) => { setTab(id); setDrawerOpen(false); }} newCount={stats.new} onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Top bar */}
        <div className="bg-surface-container-lowest/95 backdrop-blur-lg border-b border-outline-variant/15 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-20 flex items-center gap-2 min-w-0">
          {/* Hamburger */}
          <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-container transition-colors touch-press flex-shrink-0" aria-label={t(locale, "nav_open_menu")}>
            <span className="material-symbols-outlined text-on-surface text-[26px]">menu</span>
          </button>
          <Link to="/" className="md:hidden flex-shrink-0">
            <Logo className="h-9 w-9 object-contain rounded-lg" />
          </Link>
          <h1 className="font-display font-bold text-[18px] md:text-[20px] text-on-surface truncate">
            {(() => { const cfg = TAB_CONFIG.find((c) => c.id === tab); return cfg ? t(locale, cfg.labelKey) : ""; })()}
          </h1>
          {isAuthenticated() && (
            <button onClick={() => logout()} title={t(locale, "prov_sign_out")} className="ml-auto flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 rounded-xl font-bold text-[13px] hover:bg-surface-container-high transition-colors touch-press btn-press flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">logout</span><span className="hidden sm:inline">{t(locale, "prov_sign_out")}</span>
            </button>
          )}
        </div>

        <div className="p-6">

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              {/* Availability banner */}
              <button onClick={() => setTab("availability")}
                className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  busyNow ? "border-amber-300 bg-amber-50 hover:bg-amber-100/70" : "border-green-300 bg-green-50 hover:bg-green-100/70"
                }`}>
                <span className={`material-symbols-outlined text-[26px] ${busyNow ? "text-amber-600" : "text-green-600"}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {busyNow ? "event_busy" : "event_available"}
                </span>
                <div className="min-w-0 flex-grow">
                  <p className="font-bold text-[15px] text-on-surface">{t(locale, busyNow ? "prov_avail_busy_banner" : "prov_avail_free_banner")}</p>
                  <p className="text-[12px] text-outline">
                    {busyNow
                      ? (backAt
                          ? `${t(locale, "prov_avail_auto_reopen")} ${formatReopenDate(backAt, locale)} · ${t(locale, "prov_avail_waiting_list_note")}`
                          : t(locale, "prov_avail_no_end_waiting"))
                      : t(locale, "prov_avail_normal")}
                  </p>
                </div>
                <span className="material-symbols-outlined text-outline text-[20px] flex-shrink-0">chevron_right</span>
              </button>

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon="inbox" label={t(locale, "prov_kpi_total_leads")} value={stats.total} delta={delta} spark={daily.map((d) => d.value)} tint="#005578" />
                <KpiCard icon="fiber_new" label={t(locale, "prov_kpi_new_leads")} value={stats.new} tint="#2563eb" />
                <KpiCard icon="trending_up" label={t(locale, "prov_kpi_conversion")} value={stats.total ? `${conversion}%` : "—"} tint="#16a34a" />
                <KpiCard icon="grade" label={t(locale, "prov_kpi_rating")} value={company.rating} tint="#785a02" />
              </div>

              {/* Trend + status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title={t(locale, "prov_chart_leads_over_time")} subtitle={t(locale, "prov_chart_last_14")} className="lg:col-span-2"
                  action={<Link to={`/companies/${company.slug}`} target="_blank" className="text-[13px] font-bold text-primary hover:underline flex items-center gap-1">{t(locale, "prov_public_profile")} <span className="material-symbols-outlined text-[14px]">open_in_new</span></Link>}>
                  <AreaLineChart data={daily} valueLabel={t(locale, "chart_leads")} />
                </ChartCard>
                <ChartCard title={t(locale, "prov_chart_by_status")} subtitle={t(locale, "prov_chart_pipeline")}>
                  <DonutChart data={byStatus} centerValue={stats.total} centerLabel={t(locale, "chart_leads")} />
                </ChartCard>
              </div>

              {/* Recent leads */}
              <ChartCard title={t(locale, "prov_chart_recent_leads")} action={<button onClick={() => setTab("leads")} className="text-[13px] font-bold text-primary hover:underline">{t(locale, "common_view_all")}</button>}>
                {leads.length === 0 ? (
                  <EmptyState msg={t(locale, "prov_overview_empty")} icon="inbox" />
                ) : (
                  // handleLeadStatus, not the raw mutation: it also refreshes the
                  // server-paginated Leads tab, so a status changed here doesn't
                  // leave a stale row behind on the other tab.
                  <LeadRows leads={leads.slice(0, 5)} onStatusChange={handleLeadStatus} />
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
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-colors border ${
                      leadStatus === f ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
                    }`}>
                    {f === "All" ? t(locale, "companies_all") : t(locale, LEAD_STATUS_KEYS[f])}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-bold text-outline">
                  {leadTotal} {t(locale, leadTotal === 1 ? "prov_noun_lead" : "prov_noun_leads")}
                </span>
                {stats.new > 0 && <span className="bg-blue-100 text-blue-700 text-[12px] font-bold px-2.5 py-1 rounded-full">{stats.new} {t(locale, "prov_leads_new_badge")}</span>}
              </div>
              {leadApiMode && leadSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{leadSearch.error}</div>
              )}
              <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                {leadList.length === 0 ? (
                  <EmptyState
                    msg={leadApiMode && leadSearch.loading ? t(locale, "admin_searching") : (lq || leadStatus !== "All") ? t(locale, "prov_leads_no_match") : t(locale, "prov_leads_empty")}
                    icon={(lq || leadStatus !== "All") ? "search_off" : "inbox"}
                  />
                ) : (
                  <LeadRows leads={leadList} onStatusChange={handleLeadStatus} />
                )}
              </div>
              {leadApiMode && (
                <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} noun={t(locale, "prov_noun_lead")} nounPlural={t(locale, "prov_noun_leads")} />
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
                      <span key={i} className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: i <= Math.round(company.rating) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                    ))}
                  </div>
                  <p className="text-label-sm font-label-sm text-outline">{company.reviewCount} {t(locale, "prov_noun_reviews")}</p>
                </div>
              </div>

              {/* Search + rating filter */}
              {company.reviewCount > 0 && (
                <div className="space-y-3 mb-5">
                  <div className="max-w-md"><SearchInput value={reviewQuery} onChange={setReviewQuery} placeholder={t(locale, "prov_reviews_search_ph")} /></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <button onClick={() => setReviewRating(0)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${reviewRating === 0 ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>{t(locale, "companies_all")}</button>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <button key={r} onClick={() => setReviewRating(r)} className={`flex items-center gap-0.5 px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${reviewRating === r ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>
                        {r}<span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      </button>
                    ))}
                    <span className="text-[13px] font-bold text-outline ml-auto">{reviewTotal} {t(locale, reviewTotal === 1 ? "prov_noun_review" : "prov_noun_reviews")}</span>
                  </div>
                </div>
              )}

              {leadApiMode && reviewSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold mb-4">{reviewSearch.error}</div>
              )}
              {reviewList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={leadApiMode && reviewSearch.loading ? t(locale, "admin_searching") : (rq || reviewRating) ? t(locale, "prov_reviews_no_match") : t(locale, "prov_reviews_empty")} icon="search_off" /></div>
              ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                {reviewList.map((r, i) => (
                  <div key={`${r.author}-${i}`} className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map((i) => (
                          <span key={i} className="material-symbols-outlined text-secondary text-[14px]" style={{ fontVariationSettings: i <= r.rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                        ))}
                      </div>
                      {r.verified && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full" title={t(locale, "prov_review_verified_title")}>
                          <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                          {t(locale, "common_verified")}
                        </span>
                      )}
                    </div>
                    <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed flex-grow mb-4">"{r.text}"</p>
                    <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/20">
                      <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">{r.avatar}</div>
                      <div>
                        <p className="font-label-md text-label-md text-on-surface">{r.author}</p>
                        <p className="text-label-sm font-label-sm text-outline">{r.district} · {r.date}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {leadApiMode && (
                <Pagination className="mt-6" page={reviewSearch.page} pageCount={reviewSearch.pageCount} total={reviewSearch.total} pageSize={reviewSearch.pageSize} onPage={reviewSearch.setPage} noun={t(locale, "prov_noun_review")} nounPlural={t(locale, "prov_noun_reviews")} />
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
                <span className="material-symbols-outlined text-outline/50 text-[44px] mb-3 block">monitoring</span>
                <h2 className="font-bold text-[17px] text-on-surface mb-1">{t(locale, "prov_analytics_empty_title")}</h2>
                <p className="text-[14px] text-outline">{t(locale, "prov_analytics_empty_sub")}</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard icon="trending_up" label={t(locale, "prov_kpi_conversion")} value={`${conversion}%`} tint="#16a34a" />
                  <KpiCard icon="grade" label={t(locale, "prov_kpi_rating")} value={`${company.rating}★`} tint="#785a02" />
                  <KpiCard icon="reviews" label={t(locale, "prov_kpi_reviews")} value={company.reviewCount} tint="#005578" />
                  <KpiCard icon="construction" label={t(locale, "prov_kpi_projects")} value={company.completedProjects} tint="#0b6e99" />
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
                <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{t(locale, "prov_avail_tab_title")}</h3>
                <p className="text-body-md font-body-md text-outline mb-5 text-sm">
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
          {tab === "pricing" && <OfferingsEditor />}

          {/* ── Profile ── */}
          {tab === "profile" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                <div className="relative h-36 overflow-hidden">
                  <img src={company.cover} alt={company.name} className="w-full h-full object-cover" />
                </div>
                <div className="px-6 pb-6">
                  <div className="-mt-8 mb-4 w-16 h-16 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-white">
                    <img src={company.logo} alt={t(locale, "common_logo_alt")} className="w-full h-full object-cover" />
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface mb-1">{company.name}</h2>
                  <p className="text-label-md font-label-md text-outline mb-3">{company.categoryLabel}</p>
                  <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed">{company.about}</p>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-4">{t(locale, "prov_profile_services")}</h3>
                <div className="flex flex-wrap gap-2">
                  {company.services.map((s) => (
                    <span key={s} className="bg-surface-container px-3 py-1.5 rounded-full text-label-md font-label-md text-on-surface-variant border border-outline-variant/20">{s}</span>
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
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">{t(locale, "prov_settings_notifications")}</h3>
                <p className="text-body-md font-body-md text-outline mb-4 text-sm">{t(locale, "prov_settings_notifications_sub")}</p>
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
                      <p className="font-label-md text-label-md text-on-surface">{t(locale, s.labelKey)}</p>
                      <p className="text-label-sm font-label-sm text-outline">{t(locale, s.detailKey)}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-10 h-6 bg-outline-variant peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-4 peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-4">{t(locale, "prov_settings_account")}</h3>
                <p className="text-body-md font-body-md text-outline text-sm">
                  {t(locale, "prov_account_note")}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function LeadRows({ leads, onStatusChange }: { leads: Lead[]; onStatusChange: (id: string, s: LeadStatus) => void }) {
  const { locale } = useLocale();
  return (
    <div className="divide-y divide-outline-variant/10">
      {leads.map((l) => (
        <div key={l.id} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-mono text-label-sm text-primary">{l.refNumber}</span>
              <span className={`text-label-sm font-label-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status]}`}>{t(locale, LEAD_STATUS_KEYS[l.status])}</span>
            </div>
            <p className="font-label-md text-label-md text-on-surface">{l.name} — {l.phone}</p>
            <p className="text-label-sm font-label-sm text-outline">{l.service} · {l.district} · {l.budget}</p>
            {l.description && (
              <p className="text-body-md font-body-md text-on-surface-variant text-sm mt-1 line-clamp-2">{l.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <select
              value={l.status}
              onChange={(e) => onStatusChange(l.id, e.target.value as LeadStatus)}
              className="border border-outline-variant rounded-lg px-2.5 py-1 text-label-sm text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none"
            >
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
            </select>
            <span className="text-label-sm font-label-sm text-outline">{formatDate(l.createdAt, locale)}</span>
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
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-label-sm font-label-sm px-2 py-0.5 rounded-full">{p.year}</div>
                </div>
                <div className="p-4">
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{p.title}</h3>
                  <p className="text-body-md font-body-md text-on-surface-variant text-sm leading-relaxed">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="bg-surface-container-lowest rounded-2xl p-6 text-center shadow-bloom">
          <p className="text-body-md font-body-md text-outline">{t(locale, "prov_proj_needs_api")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">{t(locale, "prov_proj_title")}</h2>
          <p className="text-[12px] text-outline mt-0.5 max-w-md leading-relaxed">
            {t(locale, "prov_proj_desc")}
          </p>
        </div>
        <button onClick={() => setEditing({ project: null })}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span> {t(locale, "prov_proj_add")}
        </button>
      </div>

      {error && <p className="text-[13px] text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading && projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center text-[14px] text-outline">
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
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{p.year}</div>
                  <span className={`absolute top-2 left-2 flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                    <span className="material-symbols-outlined text-[13px]">{badge.icon}</span>{t(locale, badge.labelKey)}
                  </span>
                </div>
                <div className="p-4 flex flex-col flex-grow">
                  <h3 className="font-bold text-[15px] text-on-surface mb-1">{p.title}</h3>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-3 flex-grow">{p.description}</p>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                    <button onClick={() => setEditing({ project: p })} disabled={busyId === p.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-surface-container py-2 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">edit</span> {t(locale, "prov_proj_edit_btn")}
                    </button>
                    <button onClick={() => handleDelete(p)} disabled={busyId === p.id}
                      className="flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors px-3 py-2 text-[12px] disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">{busyId === p.id ? "progress_activity" : "delete"}</span>
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
          <h2 className="font-bold text-[18px] text-on-surface">{t(locale, isNew ? "prov_proj_add" : "prov_proj_edit")}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><span className="material-symbols-outlined text-outline">close</span></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_image")}</label>
            <div onClick={() => fileRef.current?.click()}
              className="relative h-44 w-full rounded-xl border-2 border-dashed border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40 flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors">
              {uploading ? <span className="spinner spinner-primary" />
                : img ? <img src={img} alt="" className="w-full h-full object-cover" />
                : (<><span className="material-symbols-outlined text-outline/60 text-[28px]">cloud_upload</span>
                    <p className="text-[12px] font-bold text-outline mt-1">{t(locale, "prov_upload_drop")} <span className="text-primary">{t(locale, "prov_upload_browse")}</span></p></>)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_field_title")}</label>
              <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(locale, "prov_proj_title_ph")} />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_year")}</label>
              <input className="field-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder={t(locale, "prov_proj_year_ph")} />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_description")}</label>
            <textarea className="field-input resize-y" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t(locale, "prov_proj_description_ph")} />
          </div>

          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-xl px-3 py-2.5 text-[12px] font-medium">
            <span className="material-symbols-outlined text-[18px] flex-shrink-0">info</span>
            <span>{wasApproved
              ? t(locale, "prov_proj_note_edit")
              : t(locale, "prov_proj_note_new")}</span>
          </div>

          {error && <p className="text-[13px] text-error font-bold">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-outline-variant/20 sticky bottom-0 bg-surface-container-lowest">
          <button onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-[14px] text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">{t(locale, "prov_proj_cancel")}</button>
          <button onClick={save} disabled={saving || uploading}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
            {saving ? t(locale, "prov_proj_submitting") : t(locale, isNew ? "prov_proj_submit" : "prov_proj_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ msg, icon }: { msg: string; icon: string }) {
  return (
    <div className="text-center py-14 px-6">
      <span className="material-symbols-outlined text-outline text-[48px] mb-3 block">{icon}</span>
      <p className="text-body-lg font-body-lg text-outline max-w-sm mx-auto">{msg}</p>
    </div>
  );
}

// ── Sidebar / drawer body (shared by desktop rail and mobile drawer) ──
function ProviderSidebarBody({
  company, companies, selectedSlug, setSelectedSlug, tab, onSelect, newCount, onClose,
}: {
  company: Company; companies: Company[]; selectedSlug: string; setSelectedSlug: (s: string) => void;
  tab: ProviderTab; onSelect: (id: ProviderTab) => void; newCount: number; onClose?: () => void;
}) {
  const { locale } = useLocale();
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-outline-variant/15">
        <Link to="/" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
          <Logo className="h-11 w-11 object-contain rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-display font-black text-[17px] text-on-surface leading-none truncate">Al Assema</p>
            <p className="text-[11px] font-bold text-secondary tracking-wide mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
              {t(locale, "prov_portal_label")}
            </p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label={t(locale, "nav_close_menu")}>
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        )}
      </div>

      {/* Company selector */}
      <div className="px-4 py-4 border-b border-outline-variant/15">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-outline-variant/20 bg-white flex-shrink-0">
            <img src={company.logo} alt={company.name} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-[14px] text-on-surface truncate">{company.name}</p>
            <p className="text-[11px] text-outline truncate">{company.categoryLabel}</p>
          </div>
        </div>
        {companies.length > 1 && (
          <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full border border-outline-variant rounded-lg px-2.5 py-2 text-[13px] text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none">
            {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-grow px-3 py-4 space-y-1 overflow-y-auto">
        {TAB_CONFIG.map((item) => {
          const active = tab === item.id;
          return (
            <button key={item.id} onClick={() => onSelect(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-[14px] font-bold transition-all relative touch-press ${
                active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}>
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
              {t(locale, item.labelKey)}
              {item.id === "leads" && newCount > 0 && (
                <span className="ml-auto bg-primary text-on-primary text-[11px] font-bold px-1.5 py-0.5 rounded-full">{newCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-outline-variant/15 space-y-1">
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-[13px] font-bold text-outline hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> {t(locale, "prov_back_to_site_link")}
        </Link>
      </div>
    </>
  );
}
