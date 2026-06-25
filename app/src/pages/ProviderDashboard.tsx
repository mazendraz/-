import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLeadsForCompany, updateLeadStatus, type Lead, type LeadStatus, LEAD_STATUSES, STATUS_COLORS } from "../lib/requests";
import { useCompanies, getCompany, type Company } from "../lib/catalog";
import { useAuth, logout, isAuthenticated } from "../lib/auth";
import {
  leadsPerDay, leadsPerMonth, leadsByStatus, conversionFunnel, periodDelta,
} from "../lib/analytics";
import {
  KpiCard, ChartCard, AreaLineChart, DonutChart, FunnelChart, BarChart,
} from "../components/Charts";
import SearchInput from "../components/SearchInput";

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
  const [projQuery, setProjQuery] = useState("");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewRating, setReviewRating] = useState(0);

  const company = getCompany(effectiveSlug);
  const leads = useLeadsForCompany(effectiveSlug);

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
        <Link to="/admin" className="text-primary font-label-md text-label-md hover:underline">← Admin Dashboard</Link>
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

  const pq = projQuery.trim().toLowerCase();
  const filteredProjects = company.projects.filter((p) => !pq || [p.title, p.description, p.year].some((v) => v.toLowerCase().includes(pq)));

  const rq = reviewQuery.trim().toLowerCase();
  const filteredReviews = company.reviews.filter((r) => {
    const matchRating = reviewRating === 0 || r.rating === reviewRating;
    const matchQuery = !rq || [r.author, r.text, r.district].some((v) => v.toLowerCase().includes(rq));
    return matchRating && matchQuery;
  });

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
            <img src="/logo.png" alt="Al Assemah" className="h-9 w-9 object-contain rounded-lg" />
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
                  {filteredLeads.length}{(lq || leadStatus !== "All") ? ` of ${leads.length}` : ""} lead{filteredLeads.length !== 1 ? "s" : ""}
                </span>
                {stats.new > 0 && <span className="bg-blue-100 text-blue-700 text-[12px] font-bold px-2.5 py-1 rounded-full">{stats.new} new</span>}
              </div>
              <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                {leads.length === 0 ? (
                  <EmptyState msg="No leads yet. Customer requests will appear here." icon="inbox" />
                ) : filteredLeads.length === 0 ? (
                  <EmptyState msg="No leads match your search or filter." icon="search_off" />
                ) : (
                  <LeadRows leads={filteredLeads} onStatusChange={updateLeadStatus} />
                )}
              </div>
            </div>
          )}

          {/* ── Projects ── */}
          {tab === "projects" && (
            <div className="space-y-4">
              {company.projects.length > 0 && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="w-full sm:max-w-md"><SearchInput value={projQuery} onChange={setProjQuery} placeholder="Search projects…" /></div>
                  <span className="text-[13px] font-bold text-outline">{filteredProjects.length}{pq ? ` of ${company.projects.length}` : ""} project{filteredProjects.length !== 1 ? "s" : ""}</span>
                </div>
              )}
              {filteredProjects.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={company.projects.length === 0 ? "No projects yet." : `No projects match "${projQuery}".`} icon="search_off" /></div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                {filteredProjects.map((p) => (
                  <div key={p.title} className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                    <div className="relative h-48 overflow-hidden">
                      <img src={p.img} alt={p.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
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
              <div className="mt-6 bg-surface-container-lowest rounded-2xl p-6 text-center shadow-bloom">
                <p className="text-body-md font-body-md text-outline mb-3">Want to add or update projects? Contact the Al Assema admin team.</p>
                <Link to="/admin" className="text-primary font-label-md text-label-md hover:underline">Go to Admin Dashboard</Link>
              </div>
            </div>
          )}

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
              {company.reviews.length > 0 && (
                <div className="space-y-3 mb-5">
                  <div className="max-w-md"><SearchInput value={reviewQuery} onChange={setReviewQuery} placeholder="Search reviews…" /></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <button onClick={() => setReviewRating(0)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${reviewRating === 0 ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>All</button>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <button key={r} onClick={() => setReviewRating(r)} className={`flex items-center gap-0.5 px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${reviewRating === r ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>
                        {r}<span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      </button>
                    ))}
                    <span className="text-[13px] font-bold text-outline ml-auto">{filteredReviews.length}{(rq || reviewRating) ? ` of ${company.reviews.length}` : ""}</span>
                  </div>
                </div>
              )}

              {filteredReviews.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={company.reviews.length === 0 ? "No reviews yet." : "No reviews match your search or filter."} icon="search_off" /></div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                {filteredReviews.map((r) => (
                  <div key={r.author} className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom flex flex-col">
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
                <p className="text-body-md font-body-md text-outline text-sm mb-4">
                  Provider accounts are managed by the Al Assema admin team. Contact admin to make changes.
                </p>
                <Link to="/admin" className="inline-flex items-center gap-2 text-primary font-label-md text-label-md hover:underline">
                  <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                  Contact Admin
                </Link>
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
          <img src="/logo.png" alt="Al Assemah" className="h-11 w-11 object-contain rounded-xl flex-shrink-0" />
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
        <Link to="/admin" className="flex items-center gap-2 px-2 py-2 text-[13px] font-bold text-outline hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span> Admin Dashboard
        </Link>
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-[13px] font-bold text-outline hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to site
        </Link>
      </div>
    </>
  );
}
