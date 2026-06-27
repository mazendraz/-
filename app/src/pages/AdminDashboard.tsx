import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  useLeads, updateLeadStatus, deleteLead, clearAllLeads,
  type Lead, type LeadStatus, LEAD_STATUSES, STATUS_COLORS,
} from "../lib/requests";
import {
  useCompanies, useCategoriesWithCounts,
  addCompany, updateCompany, deleteCompany,
  addCategory, updateCategory, deleteCategory,
  emptyCompany, resetCatalog, exportCatalog, importCatalog,
  type Company, type CompanyDraft, type ServiceCategory, type Project,
} from "../lib/catalog";
import {
  useSiteReviews, setSiteReviewVisible, deleteSiteReview,
  areReviewsEnabled, setReviewsEnabled, type SiteReview,
} from "../lib/siteReviews";
import {
  useFeedbacks, markFeedbackRead, deleteFeedback, useUnreadFeedbackCount,
  type Feedback, FEEDBACK_TYPE_LABELS, FEEDBACK_TYPE_ICONS, FEEDBACK_TYPE_COLORS,
} from "../lib/feedback";
import {
  canManageUsers, createUser, updateUser, deleteUser,
  type AdminUser, type Role,
} from "../lib/users";
import { loadDemoLeads } from "../lib/demo";
import {
  useSettings, updateSettings, type PlatformSettings,
  fetchEmailTemplates, saveEmailTemplates, type EmailTemplates,
  fetchLegalPagesAdmin, saveLegalPages, type LegalPages,
} from "../lib/settings";
import { isApiConfigured } from "../lib/api";
import {
  listModerationProjects, setProjectStatus, deleteProjectAdmin, type ModerationProject,
} from "../lib/projects";
import { listAdminReviews, approveAdminReview, deleteAdminReview, type AdminReview, type AdminReviewStatus } from "../lib/adminReviews";
import type { ProjectStatus } from "../lib/data";
import { logout, isAuthenticated } from "../lib/auth";
import { uploadImage, isDataUrl, type UploadBucket } from "../lib/image";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";
import Logo from "../components/Logo";
import NotificationToggle from "../components/NotificationToggle";
import { useServerSearch } from "../hooks/useServerSearch";
import {
  leadsPerDay, leadsByStatus, conversionFunnel, leadsByCompany,
  companyLeaderboard, periodDelta,
} from "../lib/analytics";
import {
  KpiCard, ChartCard, AreaLineChart, DonutChart, FunnelChart, BarList,
} from "../components/Charts";

type AdminTab = "overview" | "leads" | "companies" | "services" | "team" | "reviews" | "settings";

const NAV: { id: AdminTab; icon: string; label: string }[] = [
  { id: "overview", icon: "dashboard", label: "Overview" },
  { id: "leads", icon: "inbox", label: "Leads" },
  { id: "companies", icon: "business", label: "Companies" },
  { id: "services", icon: "category", label: "Services" },
  { id: "team", icon: "badge", label: "Team" },
  { id: "reviews", icon: "reviews", label: "Reviews" },
  { id: "settings", icon: "settings", label: "Settings" },
];

export default function AdminDashboard() {
  const leads = useLeads();
  const companies = useCompanies();
  const categories = useCategoriesWithCounts();
  const unreadFeedback = useUnreadFeedbackCount();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // When set, the Team tab auto-opens a new-user editor with this company linked.
  const [teamPrefillCompany, setTeamPrefillCompany] = useState<string | null>(null);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "All">("All");
  const [filterCompany, setFilterCompany] = useState("all");
  const [leadQuery, setLeadQuery] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  // Editor state
  const [editingCompany, setEditingCompany] = useState<{ company: Company | null } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ category: ServiceCategory | null } | null>(null);

  // Leads: server-driven search/pagination over the COMPLETE dataset when the API
  // is configured; the in-memory filter below is the demo-mode (localStorage) path.
  const leadApiMode = isApiConfigured();
  const companyIdBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.slug, c.id);
    return m;
  }, [companies]);
  const leadSearch = useServerSearch<Lead>(
    "/admin/leads",
    leadQuery,
    {
      status: filterStatus === "All" ? undefined : filterStatus,
      companyId: filterCompany === "all" ? undefined : companyIdBySlug.get(filterCompany),
    },
    { pageSize: 20, enabled: leadApiMode },
  );

  const lq = leadQuery.trim().toLowerCase();
  const filtered = leads.filter((l) => {
    const matchStatus = filterStatus === "All" || l.status === filterStatus;
    const matchCompany = filterCompany === "all" || l.companySlug === filterCompany;
    const matchQuery = !lq || [l.name, l.phone, l.refNumber, l.companyName, l.service, l.district].some((v) => v.toLowerCase().includes(lq));
    return matchStatus && matchCompany && matchQuery;
  });

  // Unified view: server page in API mode, client-filtered list in demo mode.
  const leadList = leadApiMode ? leadSearch.data : filtered;
  const leadTotal = leadApiMode ? leadSearch.total : filtered.length;

  // Mutations refresh the server page (after the PATCH/DELETE settles) so the
  // visible rows reflect the change even though they came from the backend.
  const handleLeadStatus = (id: string, status: LeadStatus) => {
    void updateLeadStatus(id, status).then(() => { if (leadApiMode) leadSearch.refresh(); });
  };
  const handleLeadDelete = (id: string) => {
    void deleteLead(id).then(() => { if (leadApiMode) leadSearch.refresh(); });
  };

  const cq = companyQuery.trim().toLowerCase();
  const filteredCompanies = companies.filter((c) => !cq || [c.name, c.categoryLabel, ...c.services].some((v) => v.toLowerCase().includes(cq)));

  // Companies: server-driven search/pagination over the COMPLETE catalog in API
  // mode; the client filter above is the demo-mode path. The catalog mutations
  // (add/update/delete) call refreshCatalogFromApi() on settle, which updates
  // `companies` — so re-running the server query on that change keeps the list in
  // sync after edits without racing the optimistic write.
  const companyApiMode = isApiConfigured();
  const companySearch = useServerSearch<Company>(
    "/admin/companies",
    companyQuery,
    {},
    { pageSize: 12, enabled: companyApiMode },
  );
  const refreshCompanyList = companySearch.refresh;
  useEffect(() => {
    if (companyApiMode) refreshCompanyList();
  }, [companies, companyApiMode, refreshCompanyList]);
  const companyList = companyApiMode ? companySearch.data : filteredCompanies;
  const companyTotal = companyApiMode ? companySearch.total : filteredCompanies.length;

  const catq = categoryQuery.trim().toLowerCase();
  const filteredCategories = categories.filter((c) => !catq || [c.label, c.description].some((v) => v.toLowerCase().includes(catq)));

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "New").length,
    inProgress: leads.filter((l) => l.status === "In Progress" || l.status === "Contacted").length,
    completed: leads.filter((l) => l.status === "Completed").length,
  };

  return (
    <div className="min-h-screen bg-surface-container flex">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant/15 flex flex-col min-h-screen hidden md:flex sticky top-0 h-screen">
        <SidebarBody tab={tab} onSelect={setTab} newCount={stats.new} reviewBadge={unreadFeedback} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[70]" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-on-background/45 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="drawer-left absolute top-0 left-0 h-full w-72 max-w-[82vw] bg-surface-container-lowest shadow-2xl flex flex-col">
            <SidebarBody tab={tab} onSelect={(id) => { setTab(id); setDrawerOpen(false); }} newCount={stats.new} reviewBadge={unreadFeedback} onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Top bar */}
        <div className="bg-surface-container-lowest/95 backdrop-blur-lg border-b border-outline-variant/15 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger — opens the nav drawer */}
            <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-container transition-colors touch-press flex-shrink-0" aria-label="Open menu">
              <span className="material-symbols-outlined text-on-surface text-[26px]">menu</span>
            </button>
            <Link to="/" className="md:hidden flex-shrink-0">
              <Logo className="h-9 w-9 object-contain rounded-lg" />
            </Link>
            <h1 className="font-display font-bold text-[18px] md:text-[20px] text-on-surface capitalize truncate">
              {NAV.find((n) => n.id === tab)?.label}
            </h1>
          </div>
          {/* Contextual quick action */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {tab === "companies" && (
              <button onClick={() => setEditingCompany({ company: null })} className="flex items-center gap-1.5 bg-primary text-on-primary px-3 md:px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">add</span><span className="hidden sm:inline">Add Company</span>
              </button>
            )}
            {tab === "services" && (
              <button onClick={() => setEditingCategory({ category: null })} className="flex items-center gap-1.5 bg-primary text-on-primary px-3 md:px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">add</span><span className="hidden sm:inline">Add Category</span>
              </button>
            )}
            {isAuthenticated() && (
              <button onClick={() => logout()} title="Sign out" className="flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 rounded-xl font-bold text-[13px] hover:bg-surface-container-high transition-colors touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">logout</span><span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 md:p-6">
          {/* ── Overview ── */}
          {tab === "overview" && (
            <AdminOverview
              leads={leads}
              companies={companies}
              categoriesCount={categories.length}
              onOpenLead={setSelectedLead}
              onViewAllLeads={() => setTab("leads")}
              onGoSettings={() => setTab("settings")}
            />
          )}

          {/* ── Leads ── */}
          {tab === "leads" && (
            <div className="space-y-4">
              <SearchInput value={leadQuery} onChange={setLeadQuery} placeholder="Search by name, phone, ref #, company…" />
              <div className="flex flex-wrap gap-3 items-center">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as LeadStatus | "All")} className="field-input !w-auto !py-2">
                  <option value="All">All Statuses</option>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="field-input !w-auto !py-2">
                  <option value="all">All Companies</option>
                  {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
                <span className="text-[13px] font-bold text-outline ml-auto">{leadTotal} lead{leadTotal !== 1 ? "s" : ""}</span>
              </div>
              {leadApiMode && leadSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{leadSearch.error}</div>
              )}
              {leadList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                  <EmptyState msg={leadApiMode && leadSearch.loading ? "Searching…" : "No leads match the current filters."} icon="search_off" />
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                    <LeadTable leads={leadList} onOpen={setSelectedLead} onStatusChange={handleLeadStatus} />
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {leadList.map((l) => <LeadMobileCard key={l.id} lead={l} onOpen={setSelectedLead} />)}
                  </div>
                </>
              )}
              {leadApiMode && (
                <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} noun="lead" />
              )}
            </div>
          )}

          {/* ── Companies ── */}
          {tab === "companies" && (
            <div className="space-y-4">
              <SearchInput value={companyQuery} onChange={setCompanyQuery} placeholder="Search companies by name, category, service…" />
              <p className="text-[14px] text-outline">
                <span className="font-black text-on-surface">{companyTotal}</span> companies
              </p>
              {companyApiMode && companySearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{companySearch.error}</div>
              )}
              {companyList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={companyApiMode && companySearch.loading ? "Searching…" : "No companies match your search."} icon="search_off" /></div>
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {companyList.map((c) => {
                  const cLeads = leads.filter((l) => l.companySlug === c.slug).length;
                  return (
                    <div key={c.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom flex items-center gap-4">
                      <img src={c.logo} alt="" className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-[15px] text-on-surface truncate">{c.name}</p>
                          {c.featured !== false && <span className="material-symbols-outlined text-secondary text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }} title="Featured">star</span>}
                        </div>
                        <p className="text-[12px] text-outline truncate">{c.categoryLabel}</p>
                        <div className="flex items-center gap-2 text-[11px] text-outline mt-0.5">
                          <span>★ {c.rating}</span><span>·</span><span>{c.completedProjects} projects</span><span>·</span><span>{cLeads} leads</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button onClick={() => setEditingCompany({ company: c })} className="flex items-center gap-1 bg-surface-container px-3 py-1.5 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors">
                          <span className="material-symbols-outlined text-[14px]">edit</span> Edit
                        </button>
                        <Link to={`/companies/${c.slug}`} target="_blank" className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-outline hover:text-primary transition-colors">
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span> View
                        </Link>
                        {canManageUsers() && (
                          <button onClick={() => { setTeamPrefillCompany(c.id); setTab("team"); }}
                            title="Create a provider login linked to this company"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-outline hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[14px]">person_add</span> Login
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
              {companyApiMode && (
                <Pagination page={companySearch.page} pageCount={companySearch.pageCount} total={companySearch.total} pageSize={companySearch.pageSize} onPage={companySearch.setPage} noun="company" nounPlural="companies" />
              )}
            </div>
          )}

          {/* ── Services (categories) ── */}
          {tab === "services" && (
            <div className="space-y-4">
              <SearchInput value={categoryQuery} onChange={setCategoryQuery} placeholder="Search categories by name or description…" />
              <p className="text-[14px] text-outline">
                <span className="font-black text-on-surface">{filteredCategories.length}</span>
                {catq ? ` of ${categories.length}` : ""} categories
              </p>
              {filteredCategories.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg="No categories match your search." icon="search_off" /></div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((cat) => (
                  <div key={cat.slug} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] text-on-surface truncate">{cat.label}</p>
                        <p className="text-[12px] text-outline">{cat.count} companies</p>
                      </div>
                    </div>
                    <p className="text-[12px] text-on-surface-variant mt-2 line-clamp-2">{cat.description}</p>
                    <CategoryCardActions cat={cat} onEdit={() => setEditingCategory({ category: cat })} />
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* ── Team (login accounts) ── */}
          {tab === "team" && (
            <TeamTab
              companies={companies}
              initialCompanyId={teamPrefillCompany}
              onConsumeInitial={() => setTeamPrefillCompany(null)}
            />
          )}

          {/* ── Reviews & Feedback ── */}
          {tab === "reviews" && <AdminReviewsTab />}

          {/* ── Settings ── */}
          {tab === "settings" && <SettingsTab leadCount={leads.length} />}
        </div>
      </main>

      {/* Modals */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={(id, s) => { handleLeadStatus(id, s); setSelectedLead((l) => (l ? { ...l, status: s } : null)); }}
          onDelete={(id) => { handleLeadDelete(id); setSelectedLead(null); }}
        />
      )}
      {editingCompany && (
        <CompanyEditor
          company={editingCompany.company}
          categories={categories}
          onClose={() => setEditingCompany(null)}
        />
      )}
      {editingCategory && (
        <CategoryEditor category={editingCategory.category} onClose={() => setEditingCategory(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN OVERVIEW — analytics command center
// ══════════════════════════════════════════════════════════════════════════
function AdminOverview({
  leads, companies, categoriesCount, onOpenLead, onViewAllLeads, onGoSettings,
}: {
  leads: Lead[];
  companies: Company[];
  categoriesCount: number;
  onOpenLead: (l: Lead) => void;
  onViewAllLeads: () => void;
  onGoSettings: () => void;
}) {
  const total = leads.length;
  const completed = leads.filter((l) => l.status === "Completed").length;
  const newCount = leads.filter((l) => l.status === "New").length;
  const conversion = total ? Math.round((completed / total) * 100) : 0;

  const daily = leadsPerDay(leads, 14);
  const spark = daily.map((d) => d.value);

  if (total === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-12 text-center max-w-lg mx-auto mt-6">
        <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-primary text-[34px]">monitoring</span>
        </div>
        <h2 className="font-bold text-[18px] text-on-surface mb-1.5">No analytics yet</h2>
        <p className="text-[14px] text-outline mb-6 leading-relaxed">
          Once customers start submitting requests, your charts populate automatically. Want to preview the dashboard now?
        </p>
        <button onClick={onGoSettings} className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">
          <span className="material-symbols-outlined text-[18px]">science</span> Load demo data
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon="inbox" label="Total Leads" value={total} delta={periodDelta(leads, 7)} spark={spark} tint="#005578" />
        <KpiCard icon="fiber_new" label="New Leads" value={newCount} tint="#2563eb" />
        <KpiCard icon="trending_up" label="Conversion" value={`${conversion}%`} tint="#16a34a" />
        <KpiCard icon="business" label="Companies" value={companies.length} tint="#785a02" />
      </div>

      {/* Trend + status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Leads Over Time" subtitle="Last 14 days" className="lg:col-span-2">
          <AreaLineChart data={daily} valueLabel="leads" />
        </ChartCard>
        <ChartCard title="By Status" subtitle="Current pipeline">
          <DonutChart data={leadsByStatus(leads)} centerValue={total} centerLabel="leads" />
        </ChartCard>
      </div>

      {/* Funnel + by company */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Conversion Funnel" subtitle="Received → Completed">
          <FunnelChart stages={conversionFunnel(leads)} />
        </ChartCard>
        <ChartCard title="Top Companies by Leads">
          <BarList data={leadsByCompany(leads, 6)} valueSuffix=" leads" />
        </ChartCard>
      </div>

      {/* Leaderboard + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Company Leaderboard" subtitle="By lead volume & performance">
          <div className="space-y-1">
            {companyLeaderboard(companies, leads).slice(0, 5).map((p, i) => (
              <div key={p.company.id} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0
                  ${i === 0 ? "bg-secondary text-on-secondary" : "bg-surface-container text-outline"}`}>{i + 1}</span>
                <img src={p.company.logo} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-on-surface truncate">{p.company.name}</p>
                  <p className="text-[11px] text-outline">★ {p.company.rating} · {p.conversion}% conversion</p>
                </div>
                <span className="font-black text-[15px] text-on-surface tabular-nums flex-shrink-0">{p.leads}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Recent Activity" action={<button onClick={onViewAllLeads} className="text-[13px] font-bold text-primary hover:underline">View all</button>}>
          <div className="space-y-1">
            {leads.slice(0, 6).map((l) => (
              <button key={l.id} onClick={() => onOpenLead(l)} className="w-full flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0 text-left hover:bg-surface-container/40 rounded-lg px-1 transition-colors">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${l.status === "New" ? "bg-blue-500 pulse-dot" : "bg-outline-variant"}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-on-surface truncate">{l.name} → {l.companyName}</p>
                  <p className="text-[11px] text-outline truncate">{l.service} · {new Date(l.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[l.status]}`}>{l.status}</span>
              </button>
            ))}
          </div>
        </ChartCard>
      </div>

      <p className="text-[11px] text-outline text-center">{categoriesCount} service categories · {companies.length} companies · {total} total leads</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  COMPANY EDITOR
// ══════════════════════════════════════════════════════════════════════════
type EditorTab = "details" | "projects";

function CompanyEditor({ company, categories, onClose }: {
  company: Company | null;
  categories: ServiceCategory[];
  onClose: () => void;
}) {
  const isNew = !company;
  const [tab, setTab] = useState<EditorTab>("details");
  const [draft, setDraft] = useState<CompanyDraft & { id?: string }>(() =>
    company ? { ...company } : emptyCompany()
  );
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CompanyDraft>(key: K, val: CompanyDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function onCategoryChange(slug: string) {
    const cat = categories.find((c) => c.slug === slug);
    setDraft((d) => ({ ...d, category: slug, categoryLabel: cat?.label ?? "" }));
  }

  // Validate the fields the live API requires before saving — otherwise the
  // create/update is rejected server-side and the row vanishes on the next sync.
  // In demo mode (no API) only the name is enforced.
  function validate(): string | null {
    if (draft.name.trim().length < 2) return "Company name must be at least 2 characters.";
    if (isApiConfigured()) {
      if (!draft.category) return "Please choose a category.";
      if (!draft.logo) return "Please add a logo image.";
      if (!draft.cover) return "Please add a cover image.";
      if (draft.phone.trim().length < 8) return "Please add a phone number (at least 8 digits).";
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) { setSaveError(problem); setTab("details"); return; }
    setSaving(true);
    setSaveError("");
    try {
      if (company) await updateCompany(company.id, draft);
      else await addCompany(draft);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setSaveError(
        /quota/i.test(msg) || (err as { name?: string })?.name === "QuotaExceededError"
          ? "Couldn't save — storage is full. Try removing some uploaded images or use smaller files."
          : msg || "Couldn't save. Please check the fields and try again."
      );
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={isNew ? "Add Company" : `Edit — ${company!.name}`} onClose={onClose} wide>
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-outline-variant/20 px-1 -mt-2 mb-5">
        {(["details", "projects"] as EditorTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-[13px] font-bold capitalize border-b-2 transition-colors ${tab === t ? "text-primary border-primary" : "text-outline border-transparent hover:text-on-surface"}`}>
            {t}
            {t === "projects" && draft.projects.length > 0 && <span className="ml-1 text-outline">({draft.projects.length})</span>}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label="Company Name" required><input className="field-input" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Aura Interiors" /></LField>
            <LField label="Category"><select className="field-input" value={draft.category} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">Select category…</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select></LField>
          </div>
          <LField label="Tagline"><input className="field-input" value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Where luxury meets precision" /></LField>
          <LField label="About"><textarea className="field-input resize-none" rows={3} value={draft.about} onChange={(e) => set("about", e.target.value)} /></LField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUpload label="Logo" value={draft.logo} onChange={(v) => set("logo", v)} shape="logo" maxDim={256} bucket="logos" />
            <ImageUpload label="Cover Image" value={draft.cover} onChange={(v) => set("cover", v)} shape="wide" maxDim={1200} bucket="covers" />
          </div>
          <GalleryUpload images={draft.gallery} onChange={(g) => set("gallery", g)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label="Phone"><input className="field-input" value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+20 100 …" /></LField>
            <LField label="Location"><input className="field-input" value={draft.location} onChange={(e) => set("location", e.target.value)} /></LField>
          </div>

          {/* Internal lead-notification contact — NOT shown publicly. New-lead
              emails are sent to this address; leave blank to disable email alerts
              for this company. */}
          <div className="bg-surface-container rounded-xl p-3.5 space-y-4">
            <p className="text-[12px] font-bold text-outline flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">notifications</span>
              Lead notifications (private — not shown on the public profile)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <LField label="Notification email">
                <input className="field-input" type="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="owner@company.com" />
              </LField>
              <LField label="WhatsApp (optional)">
                <input className="field-input" value={draft.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+20 100 …" />
              </LField>
            </div>
          </div>

          <TagField label="Services Offered" tags={draft.services} onChange={(t) => set("services", t)} placeholder="Add a service…" />
          {/* Trust numbers. Rating + Reviews are auto-calculated from the Review
              table unless an admin ticks "set manually" below to override them. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <LField label="Rating">
              {draft.ratingOverridden ? (
                <input type="number" min="0" max="5" step="0.1" className="field-input" value={draft.rating ?? 0}
                  onChange={(e) => set("rating", Math.min(5, Math.max(0, Number(e.target.value) || 0)))} />
              ) : (
                <div className="field-input bg-surface-container/50 text-on-surface-variant cursor-not-allowed flex items-center" title="Auto-calculated from real customer reviews">
                  {Number(draft.rating ?? 0).toFixed(1)}
                </div>
              )}
            </LField>
            <LField label="Reviews">
              {draft.ratingOverridden ? (
                <input type="number" min="0" className="field-input" value={draft.reviewCount ?? 0}
                  onChange={(e) => set("reviewCount", Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
              ) : (
                <div className="field-input bg-surface-container/50 text-on-surface-variant cursor-not-allowed flex items-center" title="Auto-calculated from real customer reviews">
                  {draft.reviewCount ?? 0}
                </div>
              )}
            </LField>
            <LField label="Projects"><input type="number" min="0" className="field-input" value={draft.completedProjects} onChange={(e) => set("completedProjects", Number(e.target.value))} /></LField>
            <LField label="Years Exp."><input type="number" min="0" className="field-input" value={draft.yearsExperience} onChange={(e) => set("yearsExperience", Number(e.target.value))} /></LField>
          </div>
          <label className="flex items-start gap-2.5 -mt-1 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0" checked={draft.ratingOverridden === true}
              onChange={(e) => set("ratingOverridden", e.target.checked)} />
            <span className="text-[12px] text-outline">
              {draft.ratingOverridden
                ? "Manual rating — overrides real customer reviews. Untick to revert to the automatic average."
                : "Rating & Reviews are calculated automatically from real customer reviews. Tick to set them manually."}
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label="Response Time"><input className="field-input" value={draft.responseTime} onChange={(e) => set("responseTime", e.target.value)} placeholder="within 2 hours" /></LField>
            <LField label="Verified Since"><input className="field-input" value={draft.verifiedSince} onChange={(e) => set("verifiedSince", e.target.value)} placeholder="2021" /></LField>
          </div>
          <TagField label="Credentials / Badges" tags={draft.badges} onChange={(t) => set("badges", t)} placeholder="e.g. Licensed" />
          {/* Verified toggle */}
          <label className="flex items-center gap-3 bg-primary/6 border border-primary/18 rounded-xl p-3.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={draft.verified === true} onChange={(e) => set("verified", e.target.checked)} />
            <div>
              <p className="font-bold text-[14px] text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                Verified company
              </p>
              <p className="text-[12px] text-outline">Show the blue "Verified" badge on this company's profile and cards</p>
            </div>
          </label>

          {/* Featured toggle */}
          <label className="flex items-center gap-3 bg-surface-container rounded-xl p-3.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={draft.featured !== false} onChange={(e) => set("featured", e.target.checked)} />
            <div>
              <p className="font-bold text-[14px] text-on-surface">Featured on home page</p>
              <p className="text-[12px] text-outline">Show this company in the home "Featured Companies" section</p>
            </div>
          </label>

          {/* SEO overrides — optional; blank uses the name/tagline defaults. */}
          <div className="bg-surface-container rounded-xl p-3.5 space-y-4">
            <p className="text-[12px] font-bold text-outline flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">travel_explore</span>
              SEO (optional — leave blank to use the company name &amp; tagline)
            </p>
            <LField label="Meta title">
              <input className="field-input" value={draft.metaTitle ?? ""} onChange={(e) => set("metaTitle", e.target.value)} placeholder="e.g. Aura Interiors — Luxury Fit-out in the New Capital" />
            </LField>
            <LField label="Meta description">
              <textarea className="field-input resize-none" rows={2} value={draft.metaDescription ?? ""} onChange={(e) => set("metaDescription", e.target.value)} placeholder="~160 characters shown in search results" />
            </LField>
          </div>
        </div>
      )}

      {tab === "projects" && (
        <ProjectsEditor projects={draft.projects} onChange={(p) => set("projects", p)} />
      )}

      {/* Footer actions — sticky so Save is always reachable */}
      <div className="sticky bottom-0 -mx-5 px-5 py-3.5 mt-6 bg-surface-container-lowest/97 backdrop-blur-lg border-t border-outline-variant/20 flex flex-col gap-2">
        {saveError && (
          <p className="text-[13px] text-error font-medium bg-error/8 rounded-lg px-3 py-2">{saveError}</p>
        )}
        <div className="flex items-center justify-between gap-3">
          {!isNew ? (
            <ConfirmDelete onConfirm={() => { deleteCompany(company!.id); onClose(); }} label="company" big />
          ) : <span />}
          <div className="flex gap-2.5 ml-auto">
            <button onClick={onClose} disabled={saving} className="px-4 sm:px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-[14px] text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">Cancel</button>
            <button onClick={save} disabled={saving} className="px-5 sm:px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
              {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
              {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Projects editor ──
function ProjectsEditor({ projects, onChange }: { projects: Project[]; onChange: (p: Project[]) => void }) {
  const blank = (): Project => ({ title: "", img: "", description: "", year: String(new Date().getFullYear()), featured: false });
  const [d, setD] = useState<Project>(blank);
  function add() {
    if (!d.title.trim()) return;
    onChange([{ ...d }, ...projects]);
    setD(blank());
  }
  function toggleFeatured(i: number) {
    onChange(projects.map((p, idx) => (idx === i ? { ...p, featured: !p.featured } : p)));
  }
  return (
    <div className="space-y-4">
      <div className="bg-surface-container rounded-xl p-4 space-y-3">
        <p className="text-[12px] font-black uppercase tracking-wide text-outline">Add Project</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className="field-input sm:col-span-2" placeholder="Project title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          <input className="field-input" placeholder="Year" value={d.year} onChange={(e) => setD({ ...d, year: e.target.value })} />
        </div>
        <ImageUpload label="Project Image" value={d.img} onChange={(v) => setD({ ...d, img: v })} shape="wide" maxDim={1200} bucket="projects" />
        <textarea className="field-input resize-none" rows={2} placeholder="Short description" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <label className="flex items-center gap-2 text-[13px] font-bold text-on-surface cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-secondary" checked={d.featured ?? false} onChange={(e) => setD({ ...d, featured: e.target.checked })} />
          Feature on the home page
        </label>
        <button onClick={add} className="bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-[13px] hover:bg-primary-container transition-colors">Add Project</button>
      </div>
      {projects.length === 0 ? (
        <p className="text-[13px] text-outline text-center py-6">No projects yet.</p>
      ) : projects.map((p, i) => (
        <div key={i} className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-3">
          {p.img && <img src={p.img} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" loading="lazy" />}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14px] text-on-surface truncate">{p.title}</p>
            <p className="text-[12px] text-outline truncate">{p.year} · {p.description}</p>
          </div>
          <button onClick={() => toggleFeatured(i)} title={p.featured ? "Featured on home page" : "Feature on home page"}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${p.featured ? "text-secondary" : "text-outline hover:text-secondary"}`}>
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: p.featured ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          </button>
          <button onClick={() => onChange(projects.filter((_, idx) => idx !== i))} className="p-1.5 rounded-lg hover:bg-error/10 text-outline hover:text-error transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN REVIEWS TAB
// ══════════════════════════════════════════════════════════════════════════
// Moderation queue for provider-submitted portfolio projects. Pending projects
// are hidden from the public profile until approved here. Also lets the admin
// revisit rejected ones (re-approve or delete).
function ProjectApprovals() {
  const [status, setStatus] = useState<ProjectStatus>("PENDING");
  const [items, setItems] = useState<ModerationProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ModerationProject | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await listModerationProjects(status)); }
    catch { setError("Couldn't load project submissions."); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void reload(); }, [reload]);

  async function act(p: ModerationProject, next: ProjectStatus) {
    if (!p.id) return;
    setBusyId(p.id); setError("");
    try { await setProjectStatus(p.id, next); setItems((cur) => cur.filter((x) => x.id !== p.id)); setPreview(null); }
    catch { setError("Action failed. Please try again."); }
    finally { setBusyId(null); }
  }
  async function remove(p: ModerationProject) {
    if (!p.id) return;
    setBusyId(p.id); setError("");
    try { await deleteProjectAdmin(p.id); setItems((cur) => cur.filter((x) => x.id !== p.id)); setPreview(null); }
    catch { setError("Couldn't delete that project."); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">Project approvals</h2>
          <p className="text-[12px] text-outline mt-0.5">Provider-submitted portfolio projects — approve to publish on their profile.</p>
        </div>
        <div className="flex bg-surface-container rounded-xl p-0.5">
          {(["PENDING", "REJECTED"] as ProjectStatus[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${status === s ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}>
              {s === "PENDING" ? "Pending" : "Rejected"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center text-[13px] text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={status === "PENDING" ? "No projects waiting for review." : "No rejected projects."} icon="task_alt" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div key={p.id} className="bg-surface-container-lowest rounded-xl p-3 shadow-bloom flex gap-3">
              <button onClick={() => setPreview(p)} className="flex-shrink-0 group relative" title="View project">
                <img src={p.img} alt="" className="w-20 h-20 rounded-lg object-cover border border-outline-variant/20" />
                <span className="absolute inset-0 rounded-lg bg-on-background/0 group-hover:bg-on-background/30 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-white text-[20px] opacity-0 group-hover:opacity-100 transition-opacity">zoom_in</span>
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setPreview(p)} className="font-bold text-[14px] text-on-surface text-left hover:text-primary transition-colors">{p.title}</button>
                  <span className="text-[11px] text-outline">{p.year}</span>
                </div>
                <p className="text-[12px] font-bold text-primary truncate">{p.companyName}</p>
                <p className="text-[12px] text-on-surface-variant line-clamp-2 mt-0.5">{p.description}</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setPreview(p)}
                    className="flex items-center gap-1 bg-surface-container px-3 py-1.5 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-[14px]">visibility</span> View
                  </button>
                  {status !== "APPROVED" && (
                    <button onClick={() => act(p, "APPROVED")} disabled={busyId === p.id}
                      className="flex items-center gap-1 bg-primary text-on-primary px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">check</span> Approve
                    </button>
                  )}
                  {status === "PENDING" && (
                    <button onClick={() => act(p, "REJECTED")} disabled={busyId === p.id}
                      className="flex items-center gap-1 border border-error/30 text-error px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-error/5 transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">close</span> Reject
                    </button>
                  )}
                  <button onClick={() => remove(p)} disabled={busyId === p.id}
                    className="flex items-center gap-1 text-outline px-2.5 py-1.5 rounded-lg text-[12px] font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <ProjectPreviewModal
          project={preview}
          busy={busyId === preview.id}
          onClose={() => setPreview(null)}
          onApprove={() => act(preview, "APPROVED")}
          onReject={() => act(preview, "REJECTED")}
          onDelete={() => remove(preview)}
        />
      )}
    </div>
  );
}

// Full-detail view of a submitted project so the admin can read everything before
// deciding. Approve / Reject / Delete are available right here too.
function ProjectPreviewModal({ project, busy, onClose, onApprove, onReject, onDelete }: {
  project: ModerationProject;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const isRejected = project.status === "REJECTED";
  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container-lowest w-full max-w-xl sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-[18px] text-on-surface">Review project</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><span className="material-symbols-outlined text-outline">close</span></button>
        </div>
        <div className="p-5 space-y-4">
          <img src={project.img} alt={project.title} className="w-full max-h-[50vh] object-contain rounded-xl bg-surface-container" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-[18px] text-on-surface">{project.title}</h3>
              <span className="text-[12px] font-bold text-outline">{project.year}</span>
              {isRejected && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-error/10 text-error">Rejected</span>}
            </div>
            <p className="text-[13px] font-bold text-primary mt-0.5">{project.companyName}</p>
          </div>
          {project.description
            ? <p className="text-[14px] text-on-surface-variant leading-relaxed whitespace-pre-wrap">{project.description}</p>
            : <p className="text-[13px] text-outline italic">No description provided.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 p-5 border-t border-outline-variant/20 sticky bottom-0 bg-surface-container-lowest">
          <button onClick={onDelete} disabled={busy}
            className="me-auto flex items-center gap-1 text-outline px-3 py-2.5 rounded-xl text-[13px] font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
            <span className="material-symbols-outlined text-[16px]">delete</span> Delete
          </button>
          {!isRejected && (
            <button onClick={onReject} disabled={busy}
              className="flex items-center gap-1 border border-error/30 text-error px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-error/5 transition-colors disabled:opacity-60">
              <span className="material-symbols-outlined text-[16px]">close</span> Reject
            </button>
          )}
          <button onClick={onApprove} disabled={busy}
            className="flex items-center gap-1 bg-primary text-on-primary px-5 py-2.5 rounded-xl text-[13px] font-bold hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-[16px]">check</span>}
            {busy ? "Working…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Admin moderation of customer reviews across all companies. Customer reviews are
// held PENDING (hidden + excluded from the rating) until approved here. Pending
// queue defaults; a toggle shows already-approved reviews.
function AdminCustomerReviews() {
  const [status, setStatus] = useState<AdminReviewStatus>("pending");
  const [items, setItems] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await listAdminReviews(status)); }
    catch { setError("Couldn't load customer reviews."); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void reload(); }, [reload]);

  async function approve(r: AdminReview) {
    if (!r.id) return;
    setBusyId(r.id); setError("");
    try { await approveAdminReview(r.id); setItems((cur) => cur.filter((x) => x.id !== r.id)); }
    catch { setError("Couldn't approve that review."); }
    finally { setBusyId(null); }
  }
  async function del(r: AdminReview) {
    if (!r.id) return;
    setBusyId(r.id); setError("");
    try { await deleteAdminReview(r.id); setItems((cur) => cur.filter((x) => x.id !== r.id)); }
    catch { setError("Couldn't delete that review."); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">Customer reviews</h2>
          <p className="text-[12px] text-outline mt-0.5">Reviews from customers after a completed service — approve to publish on the company profile.</p>
        </div>
        <div className="flex bg-surface-container rounded-xl p-0.5">
          {(["pending", "approved"] as AdminReviewStatus[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold capitalize transition-colors ${status === s ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center text-[13px] text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={status === "pending" ? "No reviews waiting for approval." : "No approved reviews yet."} icon="reviews" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((r) => (
            <div key={r.id} className="bg-surface-container-lowest rounded-xl p-4 shadow-bloom flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[14px] text-on-surface truncate">{r.author}</p>
                  <p className="text-[12px] font-bold text-primary truncate">{r.companyName}</p>
                </div>
                <span className="text-secondary text-[14px] tracking-tight flex-shrink-0" aria-label={`${r.rating} out of 5`}>
                  {"★".repeat(r.rating)}<span className="text-outline/30">{"★".repeat(Math.max(0, 5 - r.rating))}</span>
                </span>
              </div>
              <p className="text-[13px] text-on-surface-variant leading-relaxed mt-2 flex-grow">{r.text}</p>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                <span className="text-[11px] text-outline">{r.district} · {r.date}</span>
                <div className="flex gap-2">
                  {status === "pending" && (
                    <button onClick={() => approve(r)} disabled={busyId === r.id}
                      className="flex items-center gap-1 bg-primary text-on-primary px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">{busyId === r.id ? "progress_activity" : "check"}</span> Approve
                    </button>
                  )}
                  <button onClick={() => del(r)} disabled={busyId === r.id}
                    className="flex items-center gap-1 text-outline px-2.5 py-1.5 rounded-lg text-[12px] font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                    <span className="material-symbols-outlined text-[14px]">delete</span> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminReviewsTab() {
  const allReviews = useSiteReviews(true);
  const feedbacks = useFeedbacks();
  const [reviewsOn, setReviewsOn] = useState(areReviewsEnabled);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);

  function toggleReviews(v: boolean) {
    setReviewsOn(v);
    setReviewsEnabled(v);
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Project approvals ── */}
      <ProjectApprovals />

      {/* ── Customer reviews (verified, company-specific) ── */}
      <div className="border-t border-outline-variant/20 pt-6">
        <AdminCustomerReviews />
      </div>

      {/* ── Platform Reviews ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-[16px] text-on-surface">Platform Reviews</h2>
            <p className="text-[12px] text-outline mt-0.5">Reviews submitted by visitors about Al Assema</p>
          </div>
          {/* Enable/disable toggle */}
          <label className="flex items-center gap-2.5 bg-surface-container-lowest border border-outline-variant/25 rounded-xl px-4 py-2.5 cursor-pointer shadow-bloom">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={reviewsOn} onChange={(e) => toggleReviews(e.target.checked)} />
            <span className="text-[13px] font-bold text-on-surface">Allow new submissions</span>
          </label>
        </div>

        {allReviews.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState msg="No platform reviews yet." icon="rate_review" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allReviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}
      </div>

      {/* ── Feedback & Reports ── */}
      <div className="space-y-3 border-t border-outline-variant/20 pt-6">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">Feedback & Reports</h2>
          <p className="text-[12px] text-outline mt-0.5">Messages sent by visitors via company profiles</p>
        </div>

        {feedbacks.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState msg="No feedback submissions yet." icon="inbox" />
          </div>
        ) : (
          <div className="space-y-2">
            {feedbacks.map((f) => (
              <button key={f.id} onClick={() => { setSelectedFeedback(f); if (!f.read) markFeedbackRead(f.id); }}
                className="w-full text-left bg-surface-container-lowest rounded-xl p-4 shadow-bloom hover:shadow-bloom-hover transition-all flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${FEEDBACK_TYPE_COLORS[f.type]}`}>
                  <span className="material-symbols-outlined text-[18px]">{FEEDBACK_TYPE_ICONS[f.type]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[13px] text-on-surface">{FEEDBACK_TYPE_LABELS[f.type]}</span>
                    {f.companyName && <span className="text-[11px] text-outline">re: {f.companyName}</span>}
                    {!f.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-[13px] text-on-surface-variant line-clamp-2 mt-0.5">{f.message}</p>
                  <p className="text-[11px] text-outline mt-1">{f.name || "Anonymous"} · {new Date(f.createdAt).toLocaleDateString()}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedFeedback && (
        <FeedbackDetailModal
          feedback={selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
          onDelete={(id) => { deleteFeedback(id); setSelectedFeedback(null); }}
        />
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: SiteReview }) {
  return (
    <div className={`bg-surface-container-lowest rounded-xl p-4 border shadow-bloom flex flex-col gap-3
      ${r.visible ? "border-outline-variant/20" : "border-outline-variant/10 opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map((s) => (
            <span key={s} className="material-symbols-outlined text-secondary text-[14px]"
              style={{ fontVariationSettings: s <= r.rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setSiteReviewVisible(r.id, !r.visible)}
            title={r.visible ? "Hide review" : "Show review"}
            className="p-1.5 rounded-lg hover:bg-surface-container transition-colors text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px]">{r.visible ? "visibility" : "visibility_off"}</span>
          </button>
          <button
            onClick={() => deleteSiteReview(r.id)}
            className="p-1.5 rounded-lg hover:bg-error/10 transition-colors text-outline hover:text-error"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
      <p className="text-[13px] text-on-surface-variant leading-relaxed flex-grow">"{r.text}"</p>
      <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/15">
        <div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[12px] flex-shrink-0">
          {r.name.charAt(0)}
        </div>
        <p className="font-bold text-[12px] text-on-surface">{r.name}</p>
        <span className="text-outline text-[11px]">· {r.district}</span>
        <span className="text-outline text-[11px] ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
      </div>
      {!r.visible && (
        <span className="text-[11px] font-bold text-outline bg-surface-container px-2 py-1 rounded-full self-start">Hidden from homepage</span>
      )}
    </div>
  );
}

function FeedbackDetailModal({ feedback: f, onClose, onDelete }: { feedback: Feedback; onClose: () => void; onDelete: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <ModalShell title={FEEDBACK_TYPE_LABELS[f.type]} onClose={onClose}>
      <div className="space-y-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-bold ${FEEDBACK_TYPE_COLORS[f.type]}`}>
          <span className="material-symbols-outlined text-[18px]">{FEEDBACK_TYPE_ICONS[f.type]}</span>
          {FEEDBACK_TYPE_LABELS[f.type]}
          {f.companyName && <span className="opacity-70 font-normal ml-1">re: {f.companyName}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-[11px] font-bold text-outline mb-0.5">Name</p><p className="text-[14px] text-on-surface">{f.name || "—"}</p></div>
          <div><p className="text-[11px] font-bold text-outline mb-0.5">Phone</p><p className="text-[14px] text-on-surface">{f.phone || "—"}</p></div>
          <div><p className="text-[11px] font-bold text-outline mb-0.5">Date</p><p className="text-[14px] text-on-surface">{new Date(f.createdAt).toLocaleString()}</p></div>
        </div>
        <div>
          <p className="text-[11px] font-bold text-outline mb-1.5">Message</p>
          <div className="bg-surface-container rounded-xl p-4 text-[14px] text-on-surface leading-relaxed">{f.message}</div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-[14px] hover:bg-error/5 transition-colors">Delete</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-[14px] text-on-surface mb-3">Delete this feedback permanently?</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(f.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-[14px]">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-[14px]">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  TEAM — login accounts (ADMIN + PROVIDER). API-only; no localStorage analog.
// ══════════════════════════════════════════════════════════════════════════
function TeamTab({ companies, initialCompanyId, onConsumeInitial }: {
  companies: Company[];
  initialCompanyId?: string | null;
  onConsumeInitial?: () => void;
}) {
  const [editing, setEditing] = useState<{ user: AdminUser | null; companyId?: string } | null>(null);
  const [query, setQuery] = useState("");
  // Accounts live only on the server — search/paginate the COMPLETE set there
  // (no localStorage analog, so no demo fallback). Must run before the early
  // return below (rules of hooks).
  const userSearch = useServerSearch<AdminUser>(
    "/admin/users",
    query,
    {},
    { pageSize: 12, enabled: canManageUsers() },
  );

  // Deep-link from a company card: open a new-user editor pre-linked to it.
  useEffect(() => {
    if (initialCompanyId && canManageUsers()) {
      setEditing({ user: null, companyId: initialCompanyId });
      onConsumeInitial?.();
    }
  }, [initialCompanyId, onConsumeInitial]);

  // Accounts live only on the server — they can't be managed in demo mode.
  if (!canManageUsers()) {
    return (
      <div className="max-w-lg mx-auto mt-6 bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-[28px]">badge</span>
        </div>
        <h2 className="font-bold text-[18px] text-on-surface mb-1.5">Team accounts need the live API</h2>
        <p className="text-[14px] text-outline leading-relaxed">
          Provider and admin logins are stored on the server. Connect the backend
          (<span className="font-mono text-[13px]">VITE_API_URL</span>) and sign in
          as an admin to create and manage accounts here.
        </p>
      </div>
    );
  }

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">Login accounts</h2>
          <p className="text-[12px] text-outline mt-0.5">
            Create provider logins and link them to a company, or manage admins.
          </p>
        </div>
        <button onClick={() => setEditing({ user: null })}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press">
          <span className="material-symbols-outlined text-[18px]">person_add</span> Add User
        </button>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search by name, email, company…" />

      {userSearch.loading && userSearch.data.length === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center text-[14px] text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> Loading accounts…
        </div>
      )}
      {userSearch.error && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg="Couldn't load accounts. Check the API connection and try again." icon="cloud_off" />
        </div>
      )}
      {!userSearch.loading && !userSearch.error && userSearch.data.length === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={hasQuery ? "No accounts match your search." : "No accounts yet. Add your first provider login."} icon="badge" />
        </div>
      )}

      {userSearch.data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {userSearch.data.map((u) => (
            <div key={u.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-[16px] flex-shrink-0
                ${u.role === "ADMIN" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-[15px] text-on-surface truncate">{u.name}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0
                    ${u.role === "ADMIN" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>{u.role}</span>
                  {!u.isActive && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-container text-outline flex-shrink-0">Inactive</span>}
                </div>
                <p className="text-[12px] text-outline truncate">{u.email}</p>
                <p className="text-[11px] text-outline mt-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">{u.companyName ? "business" : "block"}</span>
                  {u.companyName ?? "No company linked"}
                </p>
              </div>
              <button onClick={() => setEditing({ user: u })}
                className="flex items-center gap-1 bg-surface-container px-3 py-1.5 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0">
                <span className="material-symbols-outlined text-[14px]">edit</span> Manage
              </button>
            </div>
          ))}
        </div>
      )}

      <Pagination page={userSearch.page} pageCount={userSearch.pageCount} total={userSearch.total} pageSize={userSearch.pageSize} onPage={userSearch.setPage} noun="account" />

      {editing && (
        <UserEditor
          user={editing.user}
          initialCompanyId={editing.companyId}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); userSearch.refresh(); }}
        />
      )}
    </div>
  );
}

function UserEditor({ user, initialCompanyId, companies, onClose, onSaved }: {
  user: AdminUser | null;
  initialCompanyId?: string;
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "PROVIDER");
  const [companyId, setCompanyId] = useState(user?.companyId ?? initialCompanyId ?? "");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (name.trim().length < 2) { setError("Name must be at least 2 characters."); return; }
    if (isNew && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (isNew && password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!isNew && password && password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setBusy(true);
    try {
      if (isNew) {
        await createUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          companyId: companyId || null,
        });
      } else {
        await updateUser(user!.id, {
          name: name.trim(),
          role,
          companyId: companyId || null,
          isActive,
          ...(password ? { password } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the account.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteUser(user!.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the account.");
      setBusy(false);
    }
  }

  return (
    <ModalShell title={isNew ? "Add User" : `Manage — ${user!.name}`} onClose={onClose}>
      <div className="space-y-4">
        <LField label="Full name" required>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed Hassan" />
        </LField>

        <LField label="Email" required>
          <input className="field-input disabled:opacity-60" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} disabled={!isNew}
            placeholder="provider@example.com" autoComplete="off" />
          {!isNew && <p className="text-[11px] text-outline mt-1">Email is the login ID and can't be changed.</p>}
        </LField>

        <LField label={isNew ? "Password" : "Reset password"} required={isNew}>
          <input className="field-input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isNew ? "At least 8 characters" : "Leave blank to keep current"}
            autoComplete="new-password" />
        </LField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LField label="Role">
            <select className="field-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="PROVIDER">Provider</option>
              <option value="ADMIN">Admin</option>
            </select>
          </LField>
          <LField label="Linked company">
            <select className="field-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">— None —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </LField>
        </div>
        {role === "PROVIDER" && !companyId && (
          <p className="text-[12px] text-secondary bg-secondary/10 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">info</span>
            A provider with no linked company won't see any leads.
          </p>
        )}

        {!isNew && (
          <label className="flex items-center gap-3 bg-surface-container rounded-xl p-3.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <div>
              <p className="font-bold text-[14px] text-on-surface">Active</p>
              <p className="text-[12px] text-outline">Turning this off revokes access immediately (signs them out on the next request).</p>
            </div>
          </label>
        )}

        {error && <p className="text-[13px] text-error font-medium bg-error/8 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-outline-variant/20">
        {!isNew ? <ConfirmDelete onConfirm={remove} label="user" big /> : <span />}
        <div className="flex gap-2.5 ml-auto">
          <button onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-[14px] text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">Cancel</button>
          <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60">
            {busy ? "Saving…" : isNew ? "Create account" : "Save changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  CATEGORY EDITOR
// ══════════════════════════════════════════════════════════════════════════
function CategoryEditor({ category, onClose }: { category: ServiceCategory | null; onClose: () => void }) {
  const isNew = !category;
  const [label, setLabel] = useState(category?.label ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "category");
  const [description, setDescription] = useState(category?.description ?? "");
  const [cover, setCover] = useState(category?.cover ?? "");
  const [metaTitle, setMetaTitle] = useState(category?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(category?.metaDescription ?? "");

  function save() {
    if (!label.trim()) { alert("Label is required."); return; }
    const fields = { label, icon, description, cover, metaTitle, metaDescription };
    if (category) updateCategory(category.slug, fields);
    else addCategory({ slug: "", ...fields });
    onClose();
  }

  return (
    <ModalShell title={isNew ? "Add Category" : `Edit — ${category!.label}`} onClose={onClose}>
      <div className="space-y-4">
        <LField label="Label" required><input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Interior & Finishing" /></LField>
        <LField label="Material Symbol icon name"><input className="field-input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. architecture" /></LField>
        <LField label="Description"><textarea className="field-input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></LField>
        <ImageUpload label="Cover Image" value={cover} onChange={setCover} shape="wide" maxDim={1200} bucket="covers" />
        <div className="flex items-center gap-2 bg-surface-container rounded-xl p-3">
          <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon || "category"}</span>
          <span className="text-[12px] text-outline">Icon preview</span>
        </div>
        {/* SEO overrides — optional; blank uses the label/description defaults. */}
        <LField label="Meta title (SEO — optional)"><input className="field-input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Leave blank to use the label" /></LField>
        <LField label="Meta description (SEO — optional)"><textarea className="field-input resize-none" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="~160 characters shown in search results" /></LField>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant/20">
        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-[14px] text-on-surface hover:bg-surface-container transition-colors">Cancel</button>
        <button onClick={save} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">{isNew ? "Create" : "Save"}</button>
      </div>
    </ModalShell>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════════════════
function SettingsTab({ leadCount }: { leadCount: number }) {
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(""), 2500); }

  function doExport() {
    const blob = new Blob([exportCatalog()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `al-assemah-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Catalog exported.");
  }

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => flash(importCatalog(txt) ? "Catalog imported." : "Import failed — invalid file."));
  }

  // These tools write to localStorage only — meaningful in demo mode, but in
  // production (API configured) the data comes from the real database, so they'd
  // be misleading (inject fake leads / appear to reset, then vanish on next sync).
  const demoMode = !isApiConfigured();

  return (
    <div className="max-w-2xl space-y-5">
      {msg && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-[13px] font-bold">{msg}</div>}

      <SettingCard icon="notifications_active" title="Push Notifications" desc="Get an instant alert on this device for every new lead — even when the dashboard is closed.">
        <NotificationToggle />
      </SettingCard>

      {demoMode ? (
        <>
          {/* Demo data */}
          <SettingCard icon="science" title="Demo Data" desc="Populate the dashboards with realistic sample leads spread across the past 4 weeks so you can preview the analytics. This adds leads only — it never touches your companies.">
            <button onClick={() => flash(`Added ${loadDemoLeads()} demo leads.`)} className="bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press">Load demo leads</button>
            <ConfirmAction label={`Clear all ${leadCount} leads`} onConfirm={() => { clearAllLeads(); flash("All leads cleared."); }} danger />
          </SettingCard>

          {/* Catalog backup */}
          <SettingCard icon="backup" title="Catalog Backup" desc="Export the full catalog (companies + categories) as a JSON file, or import a previously exported file.">
            <button onClick={doExport} className="bg-surface-container px-4 py-2.5 rounded-xl font-bold text-[13px] text-on-surface hover:bg-surface-container-high transition-colors">Export JSON</button>
            <button onClick={() => fileRef.current?.click()} className="bg-surface-container px-4 py-2.5 rounded-xl font-bold text-[13px] text-on-surface hover:bg-surface-container-high transition-colors">Import JSON</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={doImport} />
          </SettingCard>

          {/* Reset */}
          <SettingCard icon="restart_alt" title="Reset Catalog" desc="Restore the companies and categories to the original seed data. This permanently discards your edits to the catalog (leads are not affected).">
            <ConfirmAction label="Reset to defaults" onConfirm={() => { resetCatalog(); flash("Catalog reset to defaults."); }} danger />
          </SettingCard>
        </>
      ) : (
        <SettingsPanel onSaved={flash} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  Unified, tabbed platform settings (General / Branding / Email / Legal).
//  Each backing endpoint keeps its own form state; a single sticky "Save
//  Changes" persists every dirty section at once and switching tabs preserves
//  unsaved edits.
// ══════════════════════════════════════════════════════════════════════════
type SettingsSubTab = "general" | "branding" | "email" | "legal";

const SETTINGS_TABS: { id: SettingsSubTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "branding", label: "Branding" },
  { id: "email", label: "Email Templates" },
  { id: "legal", label: "Legal" },
];

// Newline-string ⇄ chip-list helpers for the Districts / Budgets tag inputs.
const linesToTags = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const tagsToLines = (t: string[]) => t.join("\n");

const EMAIL_TOKENS = [
  "{{company}}", "{{refNumber}}", "{{service}}", "{{customer}}", "{{phone}}",
  "{{district}}", "{{budget}}", "{{details}}", "{{receivedAt}}",
];

function SettingsPanel({ onSaved }: { onSaved: (msg: string) => void }) {
  const [active, setActive] = useState<SettingsSubTab>("general");

  // General + Branding share the platform-settings endpoint.
  const current = useSettings();
  const [platform, setPlatform] = useState<PlatformSettings>(current);
  const [platformDirty, setPlatformDirty] = useState(false);
  const currentKey = JSON.stringify(current);
  useEffect(() => {
    if (!platformDirty) setPlatform(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);
  const setP = (k: keyof PlatformSettings, v: string) => { setPlatform((f) => ({ ...f, [k]: v })); setPlatformDirty(true); };

  // Email templates + Legal pages load lazily from their admin endpoints.
  const [email, setEmail] = useState<EmailTemplates | null>(null);
  const [emailDirty, setEmailDirty] = useState(false);
  const setE = (k: keyof EmailTemplates, v: string) => { setEmail((f) => (f ? { ...f, [k]: v } : f)); setEmailDirty(true); };

  const [legal, setLegal] = useState<LegalPages | null>(null);
  const [legalDirty, setLegalDirty] = useState(false);
  const setL = (k: keyof LegalPages, v: string) => { setLegal((f) => (f ? { ...f, [k]: v } : f)); setLegalDirty(true); };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let on = true;
    fetchEmailTemplates().then((t) => { if (on) setEmail(t); }).catch(() => { if (on) setError("Couldn't load email templates."); });
    fetchLegalPagesAdmin().then((p) => { if (on) setLegal(p); }).catch(() => { if (on) setError("Couldn't load legal pages."); });
    return () => { on = false; };
  }, []);

  const anyDirty = platformDirty || emailDirty || legalDirty;
  const tabDirty = (id: SettingsSubTab) =>
    id === "email" ? emailDirty : id === "legal" ? legalDirty : platformDirty;

  async function saveAll() {
    setSaving(true);
    setError("");
    try {
      if (platformDirty) { await updateSettings(platform); setPlatformDirty(false); }
      if (emailDirty && email) { setEmail(await saveEmailTemplates(email)); setEmailDirty(false); }
      if (legalDirty && legal) { setLegal(await saveLegalPages(legal)); setLegalDirty(false); }
      onSaved("Settings saved.");
    } catch {
      setError("Couldn't save. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
      {/* Tabbed navigation */}
      <div className="flex gap-1 px-2 sm:px-4 border-b border-outline-variant/20 overflow-x-auto">
        {SETTINGS_TABS.map((tab) => {
          const on = active === tab.id;
          return (
            <button key={tab.id} onClick={() => setActive(tab.id)}
              className={`relative px-3 sm:px-4 py-3 text-[13px] font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                on ? "border-primary text-primary" : "border-transparent text-outline hover:text-on-surface"
              }`}>
              {tab.label}
              {tabDirty(tab.id) && <span className="ms-1.5 inline-block w-1.5 h-1.5 rounded-full bg-secondary align-middle" />}
            </button>
          );
        })}
      </div>

      <div className="p-5 space-y-4">
        {active === "general" && <GeneralSettings form={platform} setP={setP} />}
        {active === "branding" && <BrandingSettings form={platform} setP={setP} />}
        {active === "email" && <EmailSettings email={email} setE={setE} />}
        {active === "legal" && <LegalSettings legal={legal} setL={setL} />}
        {error && <p className="text-[13px] text-error font-bold">{error}</p>}
      </div>

      {/* Sticky save bar — always reachable, bottom-right of the container. */}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 px-5 py-3 rounded-b-2xl bg-surface-container-lowest/95 backdrop-blur border-t border-outline-variant/20">
        {anyDirty && <span className="me-auto text-[12px] font-bold text-secondary">You have unsaved changes</span>}
        <button onClick={saveAll} disabled={saving || !anyDirty}
          className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function SettingsHeading({ title, desc }: { title: string; desc: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-[15px] text-on-surface">{title}</h3>
      <p className="text-[13px] text-outline leading-relaxed mt-0.5">{desc}</p>
    </div>
  );
}

// Stable (module-scope) text field — avoids the remount/focus-loss bug you get
// from defining a field component inside a parent's render.
function TextField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <LField label={label}>
      <input className="field-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </LField>
  );
}

function GeneralSettings({ form, setP }: { form: PlatformSettings; setP: (k: keyof PlatformSettings, v: string) => void }) {
  return (
    <div className="space-y-4">
      <SettingsHeading title="Platform" desc="Site name, public contact details, and social links shown across the site." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Site name" value={form.site_name} onChange={(v) => setP("site_name", v)} placeholder="Al Assema" />
        <TextField label="Support email" type="email" value={form.support_email} onChange={(v) => setP("support_email", v)} placeholder="hello@site.com" />
        <TextField label="Public phone" value={form.public_phone} onChange={(v) => setP("public_phone", v)} placeholder="+20 100 …" />
        <TextField label="Address" value={form.address} onChange={(v) => setP("address", v)} placeholder="New Administrative Capital" />
        <TextField label="Facebook URL" value={form.social_facebook} onChange={(v) => setP("social_facebook", v)} placeholder="https://facebook.com/…" />
        <TextField label="Instagram URL" value={form.social_instagram} onChange={(v) => setP("social_instagram", v)} placeholder="https://instagram.com/…" />
        <TextField label="X (Twitter) URL" value={form.social_twitter} onChange={(v) => setP("social_twitter", v)} placeholder="https://x.com/…" />
        <TextField label="LinkedIn URL" value={form.social_linkedin} onChange={(v) => setP("social_linkedin", v)} placeholder="https://linkedin.com/…" />
      </div>

      {/* Request-form option lists as removable chips; blank = built-in defaults. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/15">
        <TagField label="Districts (blank = built-in defaults)" tags={linesToTags(form.districts)} onChange={(t) => setP("districts", tagsToLines(t))} placeholder="Add a district…" />
        <TagField label="Budget ranges (blank = built-in defaults)" tags={linesToTags(form.budgets)} onChange={(t) => setP("budgets", tagsToLines(t))} placeholder="Add a range…" />
      </div>

      {/* Homepage hero copy, per locale — blank uses the built-in translations. */}
      <div className="pt-2 border-t border-outline-variant/15 space-y-4">
        <p className="text-[12px] font-bold text-outline">Homepage hero (blank = built-in text)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Hero title (English)" value={form.hero_title_en} onChange={(v) => setP("hero_title_en", v)} />
          <TextField label="Hero title (Arabic)" value={form.hero_title_ar} onChange={(v) => setP("hero_title_ar", v)} />
          <TextField label="Hero subtitle (English)" value={form.hero_subtitle_en} onChange={(v) => setP("hero_subtitle_en", v)} />
          <TextField label="Hero subtitle (Arabic)" value={form.hero_subtitle_ar} onChange={(v) => setP("hero_subtitle_ar", v)} />
        </div>
      </div>
    </div>
  );
}

function BrandingSettings({ form, setP }: { form: PlatformSettings; setP: (k: keyof PlatformSettings, v: string) => void }) {
  const scale = Number(form.logo_scale) || 100;
  return (
    <div className="space-y-4">
      <SettingsHeading title="Branding" desc="Logo, favicon, and homepage background. Leave blank to use the built-in defaults." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ImageUpload label="Logo" value={form.logo_url} onChange={(v) => setP("logo_url", v)} shape="logo" maxDim={256} bucket="logos" />
        <ImageUpload label="Favicon" value={form.favicon_url} onChange={(v) => setP("favicon_url", v)} shape="logo" maxDim={64} bucket="logos" />
      </div>
      <ImageUpload label="Homepage background" value={form.hero_image_url} onChange={(v) => setP("hero_image_url", v)} shape="wide" maxDim={2000} bucket="covers" />
      <LField label={`Logo size — ${scale}%`}>
        <div className="flex items-center gap-3">
          <input type="range" min={50} max={200} step={5} value={scale}
            onChange={(e) => setP("logo_scale", e.target.value === "100" ? "" : e.target.value)}
            className="flex-1 accent-primary" />
          <button type="button" onClick={() => setP("logo_scale", "")}
            className="text-[12px] font-bold text-outline hover:text-on-surface transition-colors shrink-0">Reset</button>
        </div>
      </LField>
    </div>
  );
}

// Highlights {{tokens}} inside a textarea using a mirrored backdrop layer (a
// textarea can't style its own substrings). Backdrop + textarea share identical
// metrics so the highlight sits exactly behind the real, visible text.
function highlightTokens(value: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\{\{[^}]+\}\}/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) nodes.push(<span key={`t${i}`}>{value.slice(last, m.index)}</span>);
    nodes.push(<mark key={`m${i}`} className="rounded-[3px]" style={{ background: "rgba(0,85,120,0.16)", color: "transparent" }}>{m[0]}</mark>);
    last = m.index + m[0].length; i++;
  }
  // Trailing newline keeps the backdrop's last line in sync with the textarea.
  nodes.push(<span key="end">{value.slice(last) + "\n"}</span>);
  return nodes;
}

function HighlightTextarea({ value, onChange, onFocus, rows = 4, placeholder }: {
  value: string; onChange: (v: string) => void; onFocus?: React.FocusEventHandler<HTMLTextAreaElement>; rows?: number; placeholder?: string;
}) {
  const back = useRef<HTMLDivElement>(null);
  const shared: React.CSSProperties = { padding: "14px 16px", fontSize: 16, fontFamily: '"Inter", sans-serif', lineHeight: 1.5 };
  return (
    <div className="relative">
      <div ref={back} aria-hidden
        className="absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-[14px] pointer-events-none"
        style={{ ...shared, border: "1.5px solid transparent", color: "transparent" }}>
        {highlightTokens(value)}
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} rows={rows} placeholder={placeholder}
        onScroll={(e) => { if (back.current) back.current.scrollTop = e.currentTarget.scrollTop; }}
        className="field-input resize-y relative" style={{ ...shared, background: "transparent" }} />
    </div>
  );
}

function EmailSettings({ email, setE }: { email: EmailTemplates | null; setE: (k: keyof EmailTemplates, v: string) => void }) {
  // Track the last-focused field so a token chip inserts at its caret. The chip
  // buttons use onMouseDown→preventDefault so clicking them doesn't blur/clear it.
  const focused = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; key: keyof EmailTemplates } | null>(null);
  const track = (key: keyof EmailTemplates) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    focused.current = { el: e.currentTarget, key };
  };
  function insertToken(tok: string) {
    const f = focused.current;
    if (!f || !email) return;
    const el = f.el;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const cur = email[f.key];
    setE(f.key, cur.slice(0, start) + tok + cur.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const p = start + tok.length;
      try { el.setSelectionRange(p, p); } catch { /* inputs without range support */ }
    });
  }

  if (!email) return <p className="text-[13px] text-outline">Loading…</p>;
  return (
    <div className="space-y-4">
      <SettingsHeading title="Email templates" desc="New-lead notification emails. Leave a field blank to use the built-in default." />

      {/* Tokens toolbar */}
      <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/15">
        <p className="text-[12px] font-bold text-outline mb-2">Insert token (click to add at the cursor)</p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TOKENS.map((tok) => (
            <button key={tok} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(tok)}
              className="font-mono text-[12px] bg-primary/8 text-primary px-2.5 py-1 rounded-full font-bold hover:bg-primary/15 transition-colors touch-press">
              {tok}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] font-bold text-outline pt-2 border-t border-outline-variant/15">Provider email (sent to the company)</p>
      <LField label="Subject"><input className="field-input" value={email.providerSubject} onFocus={track("providerSubject")} onChange={(e) => setE("providerSubject", e.target.value)} placeholder="New lead {{refNumber}} — {{service}}" /></LField>
      <LField label="Body"><HighlightTextarea value={email.providerBody} onChange={(v) => setE("providerBody", v)} onFocus={track("providerBody")} rows={5} placeholder="Blank = built-in default" /></LField>

      <p className="text-[12px] font-bold text-outline pt-2 border-t border-outline-variant/15">Admin alert email (sent to all admins)</p>
      <LField label="Subject"><input className="field-input" value={email.adminSubject} onFocus={track("adminSubject")} onChange={(e) => setE("adminSubject", e.target.value)} placeholder="New lead — {{company}} — {{refNumber}}" /></LField>
      <LField label="Body"><HighlightTextarea value={email.adminBody} onChange={(v) => setE("adminBody", v)} onFocus={track("adminBody")} rows={4} placeholder="Blank = built-in default (omits customer PII)" /></LField>
    </div>
  );
}

function LegalSettings({ legal, setL }: { legal: LegalPages | null; setL: (k: keyof LegalPages, v: string) => void }) {
  const focused = useRef<{ el: HTMLTextAreaElement; key: keyof LegalPages } | null>(null);
  const track = (key: keyof LegalPages) => (e: React.FocusEvent<HTMLTextAreaElement>) => {
    focused.current = { el: e.currentTarget, key };
  };
  function wrap(before: string, after: string) {
    const f = focused.current;
    if (!f || !legal) return;
    const el = f.el;
    const s = el.selectionStart ?? 0;
    const e2 = el.selectionEnd ?? s;
    const cur = legal[f.key];
    const sel = cur.slice(s, e2) || "text";
    setL(f.key, cur.slice(0, s) + before + sel + after + cur.slice(e2));
    requestAnimationFrame(() => { el.focus(); const p1 = s + before.length; el.setSelectionRange(p1, p1 + sel.length); });
  }
  function listPrefix(ordered: boolean) {
    const f = focused.current;
    if (!f || !legal) return;
    const el = f.el;
    const s = el.selectionStart ?? 0;
    const e2 = el.selectionEnd ?? s;
    const cur = legal[f.key];
    const lineStart = cur.lastIndexOf("\n", s - 1) + 1;
    const nl = cur.indexOf("\n", e2);
    const lineEnd = nl === -1 ? cur.length : nl;
    const out = cur.slice(lineStart, lineEnd).split("\n").map((ln, i) => (ordered ? `${i + 1}. ` : "- ") + ln).join("\n");
    setL(f.key, cur.slice(0, lineStart) + out + cur.slice(lineEnd));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(lineStart, lineStart + out.length); });
  }

  const toolbar = (
    <div className="flex items-center gap-0.5 mb-1.5">
      {([
        { icon: "format_bold", title: "Bold", fn: () => wrap("**", "**") },
        { icon: "format_italic", title: "Italic", fn: () => wrap("*", "*") },
        { icon: "format_list_bulleted", title: "Bulleted list", fn: () => listPrefix(false) },
        { icon: "format_list_numbered", title: "Numbered list", fn: () => listPrefix(true) },
      ] as const).map((b) => (
        <button key={b.icon} type="button" title={b.title} onMouseDown={(e) => e.preventDefault()} onClick={b.fn}
          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[18px]">{b.icon}</span>
        </button>
      ))}
      <span className="text-[11px] text-outline ms-1.5">Markdown</span>
    </div>
  );

  if (!legal) return <p className="text-[13px] text-outline">Loading…</p>;
  return (
    <div className="space-y-4">
      <SettingsHeading title="Legal pages" desc={<>Shown at <code>/terms</code> and <code>/privacy</code> (linked in the footer). Markdown supported; leave blank to hide.</>} />
      <LField label="Terms of Service">
        {toolbar}
        <textarea className="field-input resize-y font-mono text-[14px]" rows={8} value={legal.terms} onFocus={track("terms")} onChange={(e) => setL("terms", e.target.value)} placeholder="Markdown — **bold**, *italic*, - lists…" />
      </LField>
      <LField label="Privacy Policy">
        {toolbar}
        <textarea className="field-input resize-y font-mono text-[14px]" rows={8} value={legal.privacy} onFocus={track("privacy")} onChange={(e) => setL("privacy", e.target.value)} placeholder="Markdown — **bold**, *italic*, - lists…" />
      </LField>
    </div>
  );
}

function SettingCard({ icon, title, desc, children }: { icon: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <div>
          <h3 className="font-bold text-[15px] text-on-surface">{title}</h3>
          <p className="text-[13px] text-outline leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  SHARED PIECES
// ══════════════════════════════════════════════════════════════════════════
// ── Sidebar / drawer body (shared by desktop rail and mobile drawer) ──
function SidebarBody({ tab, onSelect, newCount, reviewBadge, onClose }: {
  tab: AdminTab; onSelect: (id: AdminTab) => void; newCount: number; reviewBadge?: number; onClose?: () => void;
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
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
              ADMIN CONSOLE
            </p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors flex-shrink-0" aria-label="Close menu">
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        )}
      </div>
      <nav className="flex-grow px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
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
              {item.id === "reviews" && (reviewBadge ?? 0) > 0 && (
                <span className="ml-auto bg-error text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">{reviewBadge}</span>
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

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm">
      <div className={`bg-surface-container-lowest w-full ${wide ? "max-w-2xl" : "max-w-md"} sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-[18px] text-on-surface">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><span className="material-symbols-outlined text-outline">close</span></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function LField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-on-surface mb-1.5">{label}{required && <span className="text-error ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function TagField({ label, tags, onChange, placeholder }: { label: string; tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [val, setVal] = useState("");
  function add() {
    const t = val.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  }
  return (
    <div>
      <label className="block text-[13px] font-bold text-on-surface mb-1.5">{label}</label>
      <div className="flex gap-2 mb-2">
        <input className="field-input" value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} />
        <button onClick={add} type="button" className="bg-surface-container px-4 rounded-xl font-bold text-[13px] text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0">Add</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 bg-primary/8 text-primary px-2.5 py-1 rounded-full text-[12px] font-bold">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))}><span className="material-symbols-outlined text-[14px]">close</span></button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Single image upload — drag-and-drop zone with live preview + URL fallback ──
function ImageUpload({ label, value, onChange, shape = "wide", maxDim = 1000, bucket }: {
  label: string; value: string; onChange: (v: string) => void; shape?: "logo" | "wide"; maxDim?: number; bucket: UploadBucket;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr("");
    try { onChange(await uploadImage(f, bucket, maxDim)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not upload that image."); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  const zoneH = shape === "logo" ? "h-28" : "h-36";

  return (
    <div>
      <label className="block text-[13px] font-bold text-on-surface mb-1.5">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`relative ${zoneH} w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40"
        }`}
      >
        {busy ? (
          <span className="spinner spinner-primary" />
        ) : value ? (
          <>
            <img src={value} alt="" className={`max-h-full max-w-full ${shape === "logo" ? "object-contain p-2" : "w-full h-full object-cover"}`} />
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="absolute top-1.5 right-1.5 bg-on-background/55 text-white rounded-full p-1 hover:bg-error transition-colors" aria-label="Remove image">
              <span className="material-symbols-outlined text-[16px] block">close</span>
            </button>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-outline/60 text-[28px]">cloud_upload</span>
            <p className="text-[12px] font-bold text-outline mt-1">Drag &amp; drop or <span className="text-primary">browse</span></p>
          </>
        )}
      </div>
      <input
        className="field-input !py-2 text-[12px] mt-2"
        placeholder="…or paste an image URL"
        value={isDataUrl(value) ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      {err && <p className="text-[11px] text-error font-bold mt-1">{err}</p>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
    </div>
  );
}

// ── Multi-image gallery upload ──
function GalleryUpload({ images, onChange }: { images: string[]; onChange: (g: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true); setErr("");
    const added: string[] = [];
    let failed = 0;
    for (const f of files) {
      try { added.push(await uploadImage(f, "gallery", 1100)); } catch { failed++; }
    }
    if (added.length) onChange([...images, ...added]);
    if (failed) setErr(`${failed} image${failed > 1 ? "s" : ""} couldn't be uploaded.`);
    setBusy(false);
    if (ref.current) ref.current.value = "";
  }

  return (
    <div>
      <label className="block text-[13px] font-bold text-on-surface mb-1.5">Gallery <span className="text-outline font-normal">({images.length})</span></label>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {images.map((src) => (
          <div key={src} className="relative aspect-square rounded-lg overflow-hidden border border-outline-variant/20 group">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(images.filter((s) => s !== src))}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-on-surface/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          </div>
        ))}
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="aspect-square rounded-lg border-2 border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-outline hover:border-primary hover:text-primary transition-colors">
          {busy ? <span className="spinner spinner-primary" /> : (
            <>
              <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
              <span className="text-[10px] font-bold mt-0.5">Add</span>
            </>
          )}
        </button>
      </div>
      {err && <p className="text-[11px] text-error font-bold mt-1.5">{err}</p>}
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={onFiles} />
    </div>
  );
}

// Edit + Delete actions for a category card. Deleting a category that still has
// companies prompts for confirmation and, on confirm, cascade-deletes those
// companies too (the API blocks a plain delete with a 409).
function CategoryCardActions({ cat, onEdit }: { cat: ServiceCategory; onEdit: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const count = cat.count ?? 0;

  async function doDelete() {
    setBusy(true);
    setErr("");
    try {
      await deleteCategory(cat.slug, count > 0);
      // On success the card disappears via the catalog re-sync; nothing else to do.
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete. Please try again.");
      setBusy(false);
    }
  }

  if (armed) {
    return (
      <div className="mt-3">
        <p className="text-[12px] font-bold text-error leading-snug mb-2">
          {count > 0
            ? `This category has ${count} ${count === 1 ? "company" : "companies"}. Deleting it will permanently delete ${count === 1 ? "that company" : "those companies"} too — along with their projects, reviews and leads. This can't be undone.`
            : `Delete “${cat.label}”? This can't be undone.`}
        </p>
        {err && <p className="text-[12px] font-bold text-error mb-2">{err}</p>}
        <div className="flex gap-2">
          <button onClick={doDelete} disabled={busy}
            className="flex-1 bg-error text-white py-2 rounded-lg text-[12px] font-bold hover:bg-error/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? "Deleting…" : count > 0 ? `Delete category + ${count}` : "Delete"}
          </button>
          <button onClick={() => { setArmed(false); setErr(""); }} disabled={busy}
            className="flex-1 bg-surface-container text-on-surface py-2 rounded-lg text-[12px] font-bold hover:bg-surface-container-high transition-colors disabled:opacity-60">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-3">
      <button onClick={onEdit} className="flex-1 bg-surface-container py-2 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors">Edit</button>
      <button onClick={() => setArmed(true)}
        className="flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors px-3 py-2 text-[12px]">
        <span className="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </div>
  );
}

function ConfirmDelete({ onConfirm, label, big }: { onConfirm: () => void; label: string; big?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="flex items-center gap-1.5">
        <button onClick={onConfirm} className={`bg-error text-white rounded-lg font-bold ${big ? "px-4 py-2.5 text-[14px]" : "px-2.5 py-2 text-[12px]"}`}>Delete</button>
        <button onClick={() => setArmed(false)} className={`bg-surface-container text-on-surface rounded-lg font-bold ${big ? "px-4 py-2.5 text-[14px]" : "px-2.5 py-2 text-[12px]"}`}>Cancel</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className={`flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors ${big ? "px-4 py-2.5 text-[14px]" : "px-3 py-2 text-[12px]"}`}>
      <span className="material-symbols-outlined text-[16px]">delete</span> {big ? `Delete ${label}` : ""}
    </button>
  );
}

function ConfirmAction({ label, onConfirm, danger }: { label: string; onConfirm: () => void; danger?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => { onConfirm(); setArmed(false); }} className="bg-error text-white px-4 py-2.5 rounded-xl font-bold text-[13px]">Confirm</button>
        <button onClick={() => setArmed(false)} className="bg-surface-container px-4 py-2.5 rounded-xl font-bold text-[13px] text-on-surface">Cancel</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className={`px-4 py-2.5 rounded-xl font-bold text-[13px] transition-colors ${danger ? "border border-error/30 text-error hover:bg-error/5" : "bg-surface-container text-on-surface hover:bg-surface-container-high"}`}>
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  LEAD TABLE + MODAL (preserved)
// ══════════════════════════════════════════════════════════════════════════
// Mobile lead card — tap to open the full detail modal
function LeadMobileCard({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) {
  return (
    <button onClick={() => onOpen(lead)} className="w-full text-left bg-surface-container-lowest rounded-2xl shadow-bloom p-4 active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="font-mono text-[12px] text-primary font-bold">{lead.refNumber}</span>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[lead.status]}`}>{lead.status}</span>
      </div>
      <p className="font-bold text-[15px] text-on-surface leading-tight">{lead.name}</p>
      <p className="text-[13px] text-outline mb-2.5">{lead.phone}</p>
      <div className="flex items-center gap-1.5 text-[12px] text-on-surface-variant flex-wrap">
        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-outline">business</span>{lead.companyName}</span>
        <span className="text-outline-variant">·</span>
        <span>{lead.district}</span>
        <span className="text-outline-variant">·</span>
        <span className="text-outline">{new Date(lead.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/15">
        <span className="text-[12px] text-outline truncate">{lead.service}</span>
        <span className="text-[12px] font-bold text-primary flex items-center gap-0.5 flex-shrink-0">Details <span className="material-symbols-outlined text-[15px]">chevron_right</span></span>
      </div>
    </button>
  );
}

function LeadTable({ leads, onOpen, onStatusChange }: {
  leads: Lead[]; onOpen: (l: Lead) => void; onStatusChange: (id: string, s: LeadStatus) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-outline-variant/20 text-left">
            {["Ref #", "Customer", "Company", "Service", "District", "Status", "Date", ""].map((h) => (
              <th key={h} className="px-4 py-3 text-[12px] font-bold text-outline whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
              <td className="px-4 py-3 font-mono text-[12px] text-primary whitespace-nowrap">{l.refNumber}</td>
              <td className="px-4 py-3"><div className="font-bold text-on-surface">{l.name}</div><div className="text-outline text-[12px]">{l.phone}</div></td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{l.companyName}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap max-w-[140px] truncate">{l.service}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{l.district}</td>
              <td className="px-4 py-3">
                <select value={l.status} onChange={(e) => onStatusChange(l.id, e.target.value as LeadStatus)} onClick={(e) => e.stopPropagation()}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-bold border-none focus:outline-none cursor-pointer ${STATUS_COLORS[l.status]}`}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-outline text-[12px] whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-3"><button onClick={() => onOpen(l)} className="text-primary text-[12px] font-bold hover:underline whitespace-nowrap">Details</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadModal({ lead, onClose, onStatusChange, onDelete }: {
  lead: Lead; onClose: () => void; onStatusChange: (id: string, s: LeadStatus) => void; onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <ModalShell title={lead.refNumber} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="block text-[12px] font-bold text-outline mb-1.5">Status</label>
          <select value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)} className="field-input">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Name" val={lead.name} /><InfoField label="Phone" val={lead.phone} />
          <InfoField label="Company" val={lead.companyName} /><InfoField label="Service" val={lead.service} />
          <InfoField label="District" val={lead.district} /><InfoField label="Budget" val={lead.budget} />
          <InfoField label="Date" val={new Date(lead.createdAt).toLocaleString()} span={2} />
        </div>
        <div>
          <p className="text-[12px] font-bold text-outline mb-1.5">Project Description</p>
          <div className="bg-surface-container rounded-xl p-4 text-[14px] text-on-surface leading-relaxed">{lead.description || <span className="text-outline italic">No description.</span>}</div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-[14px] hover:bg-error/5 transition-colors">Delete Lead</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-[14px] text-on-surface mb-3">Delete this lead permanently?</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(lead.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-[14px]">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-[14px]">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function InfoField({ label, val, span = 1 }: { label: string; val: string; span?: number }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <p className="text-[12px] font-bold text-outline mb-0.5">{label}</p>
      <p className="text-[14px] text-on-surface">{val}</p>
    </div>
  );
}

function EmptyState({ msg, icon }: { msg: string; icon: string }) {
  return (
    <div className="text-center py-14 px-6">
      <span className="material-symbols-outlined text-outline text-[48px] mb-3 block">{icon}</span>
      <p className="text-[15px] text-outline max-w-sm mx-auto">{msg}</p>
    </div>
  );
}
