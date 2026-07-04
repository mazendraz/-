import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLeadsForCompany, updateLeadStatus, type Lead, type LeadStatus, LEAD_STATUSES, STATUS_COLORS } from "../lib/requests";
import { isApiConfigured } from "../lib/api";
import { listMyProjects, createMyProject, updateMyProject, deleteMyProject, type ProjectInput } from "../lib/projects";
import { uploadImage } from "../lib/image";
import type { Project } from "../lib/data";
import Pagination from "../components/Pagination";
import { useServerSearch } from "../hooks/useServerSearch";
import { useCompanies, useCompanyDetail, type Company, type Review } from "../lib/catalog";
import { useAuth, logout, isAuthenticated } from "../lib/auth";
import {
  leadsPerDay, leadsPerMonth, leadsByStatus, conversionFunnel, periodDelta,
} from "../lib/analytics";
import {
  KpiCard, ChartCard, AreaLineChart, DonutChart, FunnelChart, BarChart,
} from "../components/Charts";
import SearchInput from "../components/SearchInput";
import Logo from "../components/Logo";
import NotificationToggle from "../components/NotificationToggle";

type ProviderTab = "overview" | "leads" | "projects" | "reviews" | "analytics" | "profile" | "settings";

const TAB_CONFIG: { id: ProviderTab; icon: string; label: string }[] = [
  { id: "overview", icon: "dashboard", label: "Overview" },
  { id: "leads", icon: "inbox", label: "Leads" },
  { id: "projects", icon: "photo_library", label: "Projects" },
  { id: "reviews", icon: "star", label: "Reviews" },
  { id: "analytics", icon: "bar_chart", label: "Analytics" },
  { id: "profile", icon: "business", label: "Profile" },
  { id: "settings", icon: "settings", label: "Settings" },
];

export default function ProviderDashboard() {
  const [params] = useSearchParams();
  const companyParam = params.get("company") ?? "";
  const allCompanies = useCompanies();
  const { user } = useAuth();
  // When signed in as a provider, lock the dashboard to their own company.
  const lockedCompany = user?.companyId
    ? allCompanies.find((c) => c.id === user.companyId)
    : undefined;
  const COMPANIES = lockedCompany ? [lockedCompany] : allCompanies;
  const [selectedSlug, setSelectedSlug] = useState(companyParam || (COMPANIES[0]?.slug ?? ""));
  const effectiveSlug = lockedCompany ? lockedCompany.slug : selectedSlug;
  const [tab, setTab] = useState<ProviderTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // List search / filter state
  const [leadQuery, setLeadQuery] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus | "All">("All");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewRating, setReviewRating] = useState(0);

  // Full company (projects/reviews) fetched by slug — the cached list is now
  // lightweight cards. Falls back to the cached card while the fetch is in flight.
  const { company } = useCompanyDetail(effectiveSlug);
  const leads = useLeadsForCompany(effectiveSlug);

  // Leads: server-driven search/pagination over the provider's COMPLETE lead set
  // when the API is configured (the endpoint is auto-scoped to their own company);
  // the in-memory filter further down is the demo-mode (localStorage) path. This
  // hook must run before the `if (!company)` early return below (rules of hooks).
  const leadApiMode = isApiConfigured();
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

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "New").length,
    inProgress: leads.filter((l) => l.status === "In Progress" || l.status === "Contacted").length,
    completed: leads.filter((l) => l.status === "Completed").length,
  };

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 pt-20">
        <span className="material-symbols-outlined text-outline text-[64px]">business_center</span>
        <p className="font-headline-md text-headline-md text-on-surface">No company found.</p>
        <Link to="/" className="text-primary font-label-md text-label-md hover:underline">← Back to site</Link>
      </div>
    );
  }

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
          <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-container transition-colors touch-press flex-shrink-0" aria-label="Open menu">
            <span className="material-symbols-outlined text-on-surface text-[26px]">menu</span>
          </button>
          <Link to="/" className="md:hidden flex-shrink-0">
            <Logo className="h-9 w-9 object-contain rounded-lg" />
          </Link>
          <h1 className="font-display font-bold text-[18px] md:text-[20px] text-on-surface truncate">
            {TAB_CONFIG.find((t) => t.id === tab)?.label}
          </h1>
          {isAuthenticated() && (
            <button onClick={() => logout()} title="Sign out" className="ml-auto flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 rounded-xl font-bold text-[13px] hover:bg-surface-container-high transition-colors touch-press btn-press flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">logout</span><span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>

        <div className="p-6">

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon="inbox" label="Total Leads" value={stats.total} delta={periodDelta(leads, 7)} spark={leadsPerDay(leads, 14).map((d) => d.value)} tint="#005578" />
                <KpiCard icon="fiber_new" label="New Leads" value={stats.new} tint="#2563eb" />
                <KpiCard icon="trending_up" label="Conversion" value={stats.total ? `${Math.round((stats.completed / stats.total) * 100)}%` : "—"} tint="#16a34a" />
                <KpiCard icon="grade" label="Rating" value={company.rating} tint="#785a02" />
              </div>

              {/* Trend + status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title="Leads Over Time" subtitle="Last 14 days" className="lg:col-span-2"
                  action={<Link to={`/companies/${company.slug}`} target="_blank" className="text-[13px] font-bold text-primary hover:underline flex items-center gap-1">Public profile <span className="material-symbols-outlined text-[14px]">open_in_new</span></Link>}>
                  <AreaLineChart data={leadsPerDay(leads, 14)} valueLabel="leads" />
                </ChartCard>
                <ChartCard title="By Status" subtitle="Pipeline">
                  <DonutChart data={leadsByStatus(leads)} centerValue={stats.total} centerLabel="leads" />
                </ChartCard>
              </div>

              {/* Recent leads */}
              <ChartCard title="Recent Leads" action={<button onClick={() => setTab("leads")} className="text-[13px] font-bold text-primary hover:underline">View all</button>}>
                {leads.length === 0 ? (
                  <EmptyState msg="No leads yet. When a customer requests your services, they will appear here." icon="inbox" />
                ) : (
                  <LeadRows leads={leads.slice(0, 5)} onStatusChange={updateLeadStatus} />
                )}
              </ChartCard>
            </div>
          )}

          {/* ── Leads ── */}
          {tab === "leads" && (
            <div className="space-y-4">
              <SearchInput value={leadQuery} onChange={setLeadQuery} placeholder="Search by name, phone, reference, service…" />
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {LEAD_FILTERS.map((f) => (
                  <button key={f} onClick={() => setLeadStatus(f)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-colors border ${
                      leadStatus === f ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-bold text-outline">
                  {leadTotal} lead{leadTotal !== 1 ? "s" : ""}
                </span>
                {stats.new > 0 && <span className="bg-blue-100 text-blue-700 text-[12px] font-bold px-2.5 py-1 rounded-full">{stats.new} new</span>}
              </div>
              {leadApiMode && leadSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{leadSearch.error}</div>
              )}
              <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                {leadList.length === 0 ? (
                  <EmptyState
                    msg={leadApiMode && leadSearch.loading ? "Searching…" : (lq || leadStatus !== "All") ? "No leads match your search or filter." : "No leads yet. Customer requests will appear here."}
                    icon={(lq || leadStatus !== "All") ? "search_off" : "inbox"}
                  />
                ) : (
                  <LeadRows leads={leadList} onStatusChange={handleLeadStatus} />
                )}
              </div>
              {leadApiMode && (
                <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} noun="lead" />
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
                  <p className="text-label-sm font-label-sm text-outline">{company.reviewCount} reviews</p>
                </div>
              </div>

              {/* Search + rating filter */}
              {company.reviewCount > 0 && (
                <div className="space-y-3 mb-5">
                  <div className="max-w-md"><SearchInput value={reviewQuery} onChange={setReviewQuery} placeholder="Search reviews…" /></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <button onClick={() => setReviewRating(0)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${reviewRating === 0 ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>All</button>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <button key={r} onClick={() => setReviewRating(r)} className={`flex items-center gap-0.5 px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${reviewRating === r ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>
                        {r}<span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      </button>
                    ))}
                    <span className="text-[13px] font-bold text-outline ml-auto">{reviewTotal} review{reviewTotal !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              )}

              {leadApiMode && reviewSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold mb-4">{reviewSearch.error}</div>
              )}
              {reviewList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={leadApiMode && reviewSearch.loading ? "Searching…" : (rq || reviewRating) ? "No reviews match your search or filter." : "No reviews yet."} icon="search_off" /></div>
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
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full" title="Submitted by a verified customer">
                          <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                          Verified
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
                <Pagination className="mt-6" page={reviewSearch.page} pageCount={reviewSearch.pageCount} total={reviewSearch.total} pageSize={reviewSearch.pageSize} onPage={reviewSearch.setPage} noun="review" />
              )}
              </>
              )}
            </div>
          )}

          {/* ── Analytics ── */}
          {tab === "analytics" && (
            leads.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-12 text-center max-w-lg mx-auto">
                <span className="material-symbols-outlined text-outline/50 text-[44px] mb-3 block">monitoring</span>
                <h2 className="font-bold text-[17px] text-on-surface mb-1">No analytics yet</h2>
                <p className="text-[14px] text-outline">Charts appear here once you receive your first lead.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard icon="trending_up" label="Conversion" value={`${Math.round((stats.completed / stats.total) * 100)}%`} tint="#16a34a" />
                  <KpiCard icon="grade" label="Rating" value={`${company.rating}★`} tint="#785a02" />
                  <KpiCard icon="reviews" label="Reviews" value={company.reviewCount} tint="#005578" />
                  <KpiCard icon="construction" label="Projects" value={company.completedProjects} tint="#0b6e99" />
                </div>

                {/* Trend + status donut */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <ChartCard title="Leads Over Time" subtitle="Last 14 days" className="lg:col-span-2">
                    <AreaLineChart data={leadsPerDay(leads, 14)} valueLabel="leads" />
                  </ChartCard>
                  <ChartCard title="Status Breakdown">
                    <DonutChart data={leadsByStatus(leads)} centerValue={stats.total} centerLabel="leads" />
                  </ChartCard>
                </div>

                {/* Funnel + monthly */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Conversion Funnel" subtitle="Received → Completed">
                    <FunnelChart stages={conversionFunnel(leads)} />
                  </ChartCard>
                  <ChartCard title="Monthly Leads" subtitle="Last 6 months">
                    <BarChart data={leadsPerMonth(leads, 6)} />
                  </ChartCard>
                </div>
              </div>
            )
          )}

          {/* ── Profile ── */}
          {tab === "profile" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                <div className="relative h-36 overflow-hidden">
                  <img src={company.cover} alt={company.name} className="w-full h-full object-cover" />
                </div>
                <div className="px-6 pb-6">
                  <div className="-mt-8 mb-4 w-16 h-16 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-white">
                    <img src={company.logo} alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface mb-1">{company.name}</h2>
                  <p className="text-label-md font-label-md text-outline mb-3">{company.categoryLabel}</p>
                  <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed">{company.about}</p>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Services</h3>
                <div className="flex flex-wrap gap-2">
                  {company.services.map((s) => (
                    <span key={s} className="bg-surface-container px-3 py-1.5 rounded-full text-label-md font-label-md text-on-surface-variant border border-outline-variant/20">{s}</span>
                  ))}
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-3">Contact Info</h3>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>phone</span>
                  <span className="text-body-md font-body-md text-on-surface">{company.phone}</span>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                <p className="text-body-md font-body-md text-on-surface-variant text-sm">
                  Profile information is managed by the Al Assema admin team. To update your details, contact the admin.
                </p>
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {tab === "settings" && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Notification Preferences</h3>
                <p className="text-body-md font-body-md text-outline mb-4 text-sm">Configure how you receive lead notifications.</p>
                <div className="py-3 border-b border-outline-variant/20">
                  <NotificationToggle />
                </div>
                {[
                  { label: "Email notifications for new leads", detail: "Receive an email whenever a new lead is submitted" },
                  { label: "SMS notifications for new leads", detail: "Receive an SMS when a new request arrives" },
                  { label: "Weekly summary report", detail: "A weekly digest of your leads and activity" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0">
                    <div>
                      <p className="font-label-md text-label-md text-on-surface">{s.label}</p>
                      <p className="text-label-sm font-label-sm text-outline">{s.detail}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-10 h-6 bg-outline-variant peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-4 peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Account</h3>
                <p className="text-body-md font-body-md text-outline text-sm">
                  Provider accounts are managed by the Al Assema admin team. Contact admin to make changes.
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
  return (
    <div className="divide-y divide-outline-variant/10">
      {leads.map((l) => (
        <div key={l.id} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-mono text-label-sm text-primary">{l.refNumber}</span>
              <span className={`text-label-sm font-label-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status]}`}>{l.status}</span>
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
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-label-sm font-label-sm text-outline">{new Date(l.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Status pill shown on each provider project card.
const PROJECT_STATUS_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING: { label: "Pending review", cls: "bg-amber-100 text-amber-800", icon: "hourglass_top" },
  APPROVED: { label: "Live on site", cls: "bg-green-100 text-green-800", icon: "check_circle" },
  REJECTED: { label: "Not approved", cls: "bg-error/10 text-error", icon: "cancel" },
};

// Provider portfolio management. Providers build their own projects; each new or
// edited project is submitted for admin approval before it shows on the public
// profile. Demo mode (no API) stays read-only.
function ProviderProjectsTab({ company }: { company: Company }) {
  const apiMode = isApiConfigured();
  const [projects, setProjects] = useState<Project[]>(company.projects);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ project: Project | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!apiMode) { setProjects(company.projects); setLoading(false); return; }
    setLoading(true); setError("");
    try { setProjects(await listMyProjects()); }
    catch { setError("Couldn't load your projects."); }
    finally { setLoading(false); }
  }, [apiMode, company.projects]);

  useEffect(() => { void reload(); }, [reload]);

  async function handleDelete(p: Project) {
    if (!p.id) return;
    setBusyId(p.id); setError("");
    try { await deleteMyProject(p.id); await reload(); }
    catch { setError("Couldn't delete that project."); setBusyId(null); }
  }

  // Demo mode (no API): keep the old read-only view.
  if (!apiMode) {
    return (
      <div className="space-y-4">
        {company.projects.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg="No projects yet." icon="photo_library" /></div>
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
          <p className="text-body-md font-body-md text-outline">Connect the live API to add and manage your own projects.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">Portfolio projects</h2>
          <p className="text-[12px] text-outline mt-0.5 max-w-md leading-relaxed">
            Showcase your work. New or edited projects are reviewed by an admin before they appear on your public profile.
          </p>
        </div>
        <button onClick={() => setEditing({ project: null })}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span> Add project
        </button>
      </div>

      {error && <p className="text-[13px] text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading && projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center text-[14px] text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg="No projects yet. Add your first one — it'll go live once an admin approves it." icon="photo_library" /></div>
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
                    <span className="material-symbols-outlined text-[13px]">{badge.icon}</span>{badge.label}
                  </span>
                </div>
                <div className="p-4 flex flex-col flex-grow">
                  <h3 className="font-bold text-[15px] text-on-surface mb-1">{p.title}</h3>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-3 flex-grow">{p.description}</p>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                    <button onClick={() => setEditing({ project: p })} disabled={busyId === p.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-surface-container py-2 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">edit</span> Edit
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
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't upload that image."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function save() {
    if (title.trim().length < 1) { setError("Please add a project title."); return; }
    if (!img) { setError("Please add a project image."); return; }
    if (!year.trim()) { setError("Please add the year."); return; }
    setSaving(true); setError("");
    const input: ProjectInput = { title: title.trim(), img, description: description.trim(), year: year.trim() };
    try {
      if (project?.id) await updateMyProject(project.id, input);
      else await createMyProject(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the project. Please try again.");
      setSaving(false);
    }
  }

  const wasApproved = project?.status === "APPROVED";

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container-lowest w-full max-w-lg sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-[18px] text-on-surface">{isNew ? "Add project" : "Edit project"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><span className="material-symbols-outlined text-outline">close</span></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-[13px] font-bold text-on-surface mb-1.5">Project image</label>
            <div onClick={() => fileRef.current?.click()}
              className="relative h-44 w-full rounded-xl border-2 border-dashed border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40 flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors">
              {uploading ? <span className="spinner spinner-primary" />
                : img ? <img src={img} alt="" className="w-full h-full object-cover" />
                : (<><span className="material-symbols-outlined text-outline/60 text-[28px]">cloud_upload</span>
                    <p className="text-[12px] font-bold text-outline mt-1">Drag &amp; drop or <span className="text-primary">browse</span></p></>)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[13px] font-bold text-on-surface mb-1.5">Title</label>
              <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Modern villa fit-out" />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-on-surface mb-1.5">Year</label>
              <input className="field-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-bold text-on-surface mb-1.5">Description</label>
            <textarea className="field-input resize-y" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was the project? Scope, style, outcome…" />
          </div>

          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-xl px-3 py-2.5 text-[12px] font-medium">
            <span className="material-symbols-outlined text-[18px] flex-shrink-0">info</span>
            <span>{wasApproved
              ? "Editing a live project sends it back for admin review before the changes appear publicly."
              : "This project will be reviewed by an admin before it appears on your public profile."}</span>
          </div>

          {error && <p className="text-[13px] text-error font-bold">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-outline-variant/20 sticky bottom-0 bg-surface-container-lowest">
          <button onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-[14px] text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">Cancel</button>
          <button onClick={save} disabled={saving || uploading}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
            {saving ? "Submitting…" : isNew ? "Submit for review" : "Save changes"}
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
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-outline-variant/15">
        <Link to="/" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
          <Logo className="h-11 w-11 object-contain rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-display font-black text-[17px] text-on-surface leading-none truncate">Al Assemah</p>
            <p className="text-[11px] font-bold text-secondary tracking-wide mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
              PARTNER PORTAL
            </p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label="Close menu">
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
              {item.label}
              {item.id === "leads" && newCount > 0 && (
                <span className="ml-auto bg-primary text-on-primary text-[11px] font-bold px-1.5 py-0.5 rounded-full">{newCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-outline-variant/15 space-y-1">
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-[13px] font-bold text-outline hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to site
        </Link>
      </div>
    </>
  );
}
