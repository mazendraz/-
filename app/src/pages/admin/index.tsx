import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useLeads, updateLeadStatus, deleteLead,
  type Lead, type LeadStatus, LEAD_STATUSES, LEAD_STATUS_KEYS,
} from "../../lib/requests";
import {
  useCompanies, useCategoriesWithCounts,
  type Company, type ServiceCategory,
} from "../../lib/catalog";
import { useUnreadFeedbackCount } from "../../lib/feedback";
import { usePendingChangeCount } from "../../lib/changeRequests";
import { useUnreadChatCount } from "../../lib/chat";
import { canManageUsers } from "../../lib/users";
import { isApiConfigured } from "../../lib/api";
import { useLeadStats } from "../../lib/stats";
import { logout, isAuthenticated } from "../../lib/auth";
import SearchInput from "../../components/SearchInput";
import Pagination from "../../components/Pagination";
import Logo from "../../components/Logo";
import { useServerSearch } from "../../hooks/useServerSearch";
import {
  setCompanyAvailability, isBusy, formatReopenDate, availableAgainAt,
  setWaitlistStatus, deleteWaitlistEntry,
  type WaitlistEntry, type WaitlistStatus,
} from "../../lib/availability";
import { type AdminTab, NAV } from "./nav";
import { AdminOverview } from "./OverviewTab";
import { LeadTable, LeadMobileCard, LeadModal, WaitlistDetailModal, type LeadListRow } from "./LeadsTab";
import { CompanyEditor } from "./CompanyEditor";
import { CategoryEditor, CategoryCardActions } from "./CategoryEditor";
import { TeamTab } from "./TeamTab";
import { AdminReviewsTab } from "./ReviewsTab";
import { ChangeRequestsTab } from "./ChangeRequestsTab";
import { ChatTab } from "./ChatTab";
import { SiteStatusTab } from "./SiteStatusTab";
import { SettingsTab } from "./SettingsTab";
import { SidebarBody } from "./components/SidebarBody";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";

export default function AdminDashboard() {
  const { locale } = useLocale();
  const leads = useLeads();
  const companies = useCompanies();
  const categories = useCategoriesWithCounts();
  const unreadFeedback = useUnreadFeedbackCount();
  const pendingChanges = usePendingChangeCount();
  const unreadChats = useUnreadChatCount();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // When set, the Team tab auto-opens a new-user editor with this company linked.
  const [teamPrefillCompany, setTeamPrefillCompany] = useState<string | null>(null);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedWaitlist, setSelectedWaitlist] = useState<WaitlistEntry | null>(null);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "All" | "Waitlist">("All");
  const [filterCompany, setFilterCompany] = useState("all");
  const [leadQuery, setLeadQuery] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  // Editor state
  const [editingCompany, setEditingCompany] = useState<{ company: Company | null } | null>(null);
  const [busyToggleId, setBusyToggleId] = useState<string | null>(null); // company row availability quick-toggle in flight
  const [busyError, setBusyError] = useState<string | null>(null); // company id whose toggle just failed
  const [editingCategory, setEditingCategory] = useState<{ category: ServiceCategory | null } | null>(null);

  // Leads: server-driven search/pagination over the COMPLETE dataset when the API
  // is configured; the in-memory filter below is the demo-mode (localStorage) path.
  const leadApiMode = isApiConfigured();
  const companyIdBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.slug, c.id);
    return m;
  }, [companies]);
  // A specific Lead status only ever matches leads (a waitlist join has no Lead
  // status); "Waitlist" only ever matches waitlist entries. Each source is only
  // fetched when it can actually contribute rows to the current filter.
  const showLeads = filterStatus !== "Waitlist";
  const showWaitlist = filterStatus === "All" || filterStatus === "Waitlist";
  const filterCompanyId = filterCompany === "all" ? undefined : companyIdBySlug.get(filterCompany);

  const leadSearch = useServerSearch<Lead>(
    "/admin/leads",
    leadQuery,
    {
      status: showLeads && filterStatus !== "All" ? filterStatus : undefined,
      companyId: filterCompanyId,
    },
    { pageSize: 20, enabled: leadApiMode && showLeads },
  );
  // Waiting-list entries across every company — merged into the same Leads tab,
  // tagged and colored differently (see LeadListRow/LeadTable in LeadsTab.tsx).
  // Pagination stays driven by leadSearch when both are shown together: real
  // volume here is small (it only accumulates while a company is busy), so a
  // perfectly unified cross-table sort isn't worth the complexity.
  const waitlistSearch = useServerSearch<WaitlistEntry>(
    "/admin/waitlist",
    leadQuery,
    { companyId: filterCompanyId },
    { pageSize: 20, enabled: leadApiMode && showWaitlist },
  );

  const lq = leadQuery.trim().toLowerCase();
  const filtered = leads.filter((l) => {
    const matchStatus = filterStatus === "All" || l.status === filterStatus;
    const matchCompany = filterCompany === "all" || l.companySlug === filterCompany;
    const matchQuery = !lq || [l.name, l.phone, l.refNumber, l.companyName, l.service, l.district].some((v) => v.toLowerCase().includes(lq));
    return matchStatus && matchCompany && matchQuery;
  });

  // Unified view: server page in API mode, client-filtered list in demo mode.
  // Demo mode (no API) has no waitlist data source, so it only ever shows leads.
  const leadList = leadApiMode ? leadSearch.data : filtered;
  const leadTotal = leadApiMode ? leadSearch.total : filtered.length;
  const waitlistList = leadApiMode ? waitlistSearch.data : [];
  const waitlistTotal = leadApiMode ? waitlistSearch.total : 0;

  const leadRows: LeadListRow[] = leadList.map((data) => ({ kind: "lead", data }) as const);
  const waitlistRows: LeadListRow[] = waitlistList.map((data) => ({ kind: "waitlist", data }) as const);
  const mergedRows: LeadListRow[] = showLeads && showWaitlist
    ? [...leadRows, ...waitlistRows].sort((a, b) => b.data.createdAt - a.data.createdAt)
    : showWaitlist ? waitlistRows : leadRows;
  const displayedTotal = showLeads && showWaitlist ? leadTotal + waitlistTotal : showWaitlist ? waitlistTotal : leadTotal;

  const handleOpenRow = (row: LeadListRow) => {
    if (row.kind === "lead") setSelectedLead(row.data);
    else setSelectedWaitlist(row.data);
  };

  // Mutations refresh the server page (after the PATCH/DELETE settles) so the
  // visible rows reflect the change even though they came from the backend.
  const handleLeadStatus = (id: string, status: LeadStatus) => {
    void updateLeadStatus(id, status).then(() => { if (leadApiMode) leadSearch.refresh(); });
  };
  const handleLeadDelete = (id: string) => {
    void deleteLead(id).then(() => { if (leadApiMode) leadSearch.refresh(); });
  };
  const handleWaitlistStatus = (entry: WaitlistEntry, status: WaitlistStatus) => {
    void setWaitlistStatus({ kind: "admin", companyId: entry.companyId }, entry.id, status)
      .then(() => waitlistSearch.refresh());
  };
  const handleWaitlistDelete = (entry: WaitlistEntry) => {
    void deleteWaitlistEntry({ kind: "admin", companyId: entry.companyId }, entry.id)
      .then(() => waitlistSearch.refresh());
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

  // The "new leads" badge counts the whole table. Derived from `leads` it was
  // counting one capped page, so the badge stopped growing at exactly the point
  // an admin most needs it to be right.
  const { stats: agg } = useLeadStats({ days: 1, months: 1 });
  const newLeadCount = agg ? (agg.byStatus.New ?? 0) : leads.filter((l) => l.status === "New").length;

  return (
    <div className="min-h-screen bg-surface-container flex">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant/15 flex flex-col min-h-screen hidden md:flex sticky top-0 h-screen">
        <SidebarBody tab={tab} onSelect={setTab} newCount={newLeadCount} reviewBadge={unreadFeedback} changeBadge={pendingChanges} chatBadge={unreadChats} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[70]" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-on-background/45 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="drawer-left absolute top-0 left-0 h-full w-72 max-w-[82vw] bg-surface-container-lowest shadow-2xl flex flex-col">
            <SidebarBody tab={tab} onSelect={(id) => { setTab(id); setDrawerOpen(false); }} newCount={newLeadCount} reviewBadge={unreadFeedback} changeBadge={pendingChanges} chatBadge={unreadChats} onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Top bar */}
        <div className="bg-surface-container-lowest/95 backdrop-blur-lg border-b border-outline-variant/15 px-4 md:px-6 py-3 md:py-4 sticky top-0 z-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger — opens the nav drawer */}
            <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-container transition-colors touch-press flex-shrink-0" aria-label={t(locale, "nav_open_menu")}>
              <span className="material-symbols-outlined text-on-surface text-[26px]">menu</span>
            </button>
            <Link to="/" className="md:hidden flex-shrink-0">
              <Logo className="h-9 w-9 object-contain rounded-lg" />
            </Link>
            <h1 className="font-display font-bold text-[18px] md:text-[20px] text-on-surface capitalize truncate">
              {(() => { const cfg = NAV.find((n) => n.id === tab); return cfg ? t(locale, cfg.labelKey) : ""; })()}
            </h1>
          </div>
          {/* Contextual quick action */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {tab === "companies" && (
              <button onClick={() => setEditingCompany({ company: null })} className="flex items-center gap-1.5 bg-primary text-on-primary px-3 md:px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">add</span><span className="hidden sm:inline">{t(locale, "admin_add_company")}</span>
              </button>
            )}
            {tab === "services" && (
              <button onClick={() => setEditingCategory({ category: null })} className="flex items-center gap-1.5 bg-primary text-on-primary px-3 md:px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">add</span><span className="hidden sm:inline">{t(locale, "admin_add_category")}</span>
              </button>
            )}
            {isAuthenticated() && (
              <button onClick={() => logout()} title={t(locale, "admin_sign_out")} className="flex items-center gap-1.5 bg-surface-container text-on-surface px-3 py-2 rounded-xl font-bold text-[13px] hover:bg-surface-container-high transition-colors touch-press btn-press">
                <span className="material-symbols-outlined text-[18px]">logout</span><span className="hidden sm:inline">{t(locale, "admin_sign_out")}</span>
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
              <SearchInput value={leadQuery} onChange={setLeadQuery} placeholder={t(locale, "admin_leads_search")} />
              <div className="flex flex-wrap gap-3 items-center">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as LeadStatus | "All" | "Waitlist")} className="field-input !w-auto !py-2">
                  <option value="All">{t(locale, "admin_all_statuses")}</option>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
                  <option value="Waitlist">{t(locale, "requests_filter_waitlist")}</option>
                </select>
                <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="field-input !w-auto !py-2">
                  <option value="all">{t(locale, "admin_all_companies")}</option>
                  {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
                <span className="text-[13px] font-bold text-outline ml-auto">{displayedTotal} {t(locale, displayedTotal === 1 ? "admin_noun_lead" : "admin_noun_leads")}</span>
              </div>
              {leadApiMode && (leadSearch.error || waitlistSearch.error) && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{leadSearch.error || waitlistSearch.error}</div>
              )}
              {mergedRows.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                  <EmptyState msg={t(locale, leadApiMode && (leadSearch.loading || waitlistSearch.loading) ? "admin_searching" : "admin_leads_none")} icon="search_off" />
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                    <LeadTable rows={mergedRows} onOpen={handleOpenRow} onLeadStatusChange={handleLeadStatus} onWaitlistStatusChange={handleWaitlistStatus} />
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {mergedRows.map((row) => <LeadMobileCard key={`${row.kind}-${row.data.id}`} row={row} onOpen={handleOpenRow} />)}
                  </div>
                </>
              )}
              {leadApiMode && (
                showWaitlist && !showLeads
                  ? <Pagination page={waitlistSearch.page} pageCount={waitlistSearch.pageCount} total={waitlistSearch.total} pageSize={waitlistSearch.pageSize} onPage={waitlistSearch.setPage} noun={t(locale, "admin_noun_lead")} nounPlural={t(locale, "admin_noun_leads")} />
                  : <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} noun={t(locale, "admin_noun_lead")} nounPlural={t(locale, "admin_noun_leads")} />
              )}
            </div>
          )}

          {/* ── Companies ── */}
          {tab === "companies" && (
            <div className="space-y-4">
              <SearchInput value={companyQuery} onChange={setCompanyQuery} placeholder={t(locale, "admin_companies_search")} />
              <p className="text-[14px] text-outline">
                <span className="font-black text-on-surface">{companyTotal}</span> {t(locale, "admin_companies_count")}
              </p>
              {companyApiMode && companySearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{companySearch.error}</div>
              )}
              {companyList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, companyApiMode && companySearch.loading ? "admin_searching" : "admin_companies_none")} icon="search_off" /></div>
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {companyList.map((c) => {
                  // From the server's COUNT when present. Filtering the local lead
                  // list only works in demo mode, where localStorage holds every
                  // lead; in API mode it is one capped page and under-reports.
                  const cLeads = c.leadCount ?? leads.filter((l) => l.companySlug === c.slug).length;
                  const cBackAt = availableAgainAt(c);
                  return (
                    <div key={c.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom flex items-center gap-4">
                      <img src={c.logo} alt="" className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-[15px] text-on-surface truncate">{c.name}</p>
                          {c.featured !== false && <span className="material-symbols-outlined text-secondary text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }} title={t(locale, "admin_featured")}>star</span>}
                          {isBusy(c) && (
                            <span className="flex items-center gap-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              title={cBackAt ? `${t(locale, "admin_busy_until")} ${formatReopenDate(cBackAt, locale)}` : t(locale, "admin_busy")}>
                              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>event_busy</span>{t(locale, "admin_busy")}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-outline truncate">{c.categoryLabel}</p>
                        <div className="flex items-center gap-2 text-[11px] text-outline mt-0.5">
                          <span>★ {c.rating}</span><span>·</span><span>{c.completedProjects} {t(locale, "admin_projects")}</span><span>·</span><span>{cLeads} {t(locale, "admin_noun_leads")}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button onClick={() => setEditingCompany({ company: c })} className="flex items-center gap-1 bg-surface-container px-3 py-1.5 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors">
                          <span className="material-symbols-outlined text-[14px]">edit</span> {t(locale, "admin_edit")}
                        </button>
                        <button
                          onClick={() => {
                            if (busyToggleId === c.id) return; // in flight — ignore a second click
                            setBusyToggleId(c.id);
                            setBusyError(null);
                            void setCompanyAvailability(c.id, { busy: !isBusy(c) })
                              // A rejected request used to be an unhandled promise:
                              // the spinner stopped, the row did not change, and
                              // nothing said why. Silence looked exactly like a
                              // button that does nothing.
                              .catch(() => setBusyError(c.id))
                              .finally(() => setBusyToggleId(null));
                          }}
                          disabled={busyToggleId === c.id}
                          title={t(locale, isBusy(c) ? "admin_mark_available" : "admin_mark_busy")}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-60 ${
                            isBusy(c) ? "text-amber-700 hover:bg-amber-50" : "text-outline hover:text-primary"
                          }`}>
                          <span className="material-symbols-outlined text-[14px]">{busyToggleId === c.id ? "progress_activity" : (isBusy(c) ? "event_available" : "event_busy")}</span>
                          {t(locale, isBusy(c) ? "admin_open" : "admin_busy")}
                        </button>
                        {busyError === c.id && (
                          <p className="text-[11px] font-bold text-error max-w-[9rem] leading-snug">
                            {t(locale, "admin_busy_toggle_failed")}
                          </p>
                        )}
                        <Link to={`/companies/${c.slug}`} target="_blank" className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-outline hover:text-primary transition-colors">
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span> {t(locale, "admin_view")}
                        </Link>
                        {canManageUsers() && (
                          <button onClick={() => { setTeamPrefillCompany(c.id); setTab("team"); }}
                            title={t(locale, "admin_create_login_title")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-outline hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[14px]">person_add</span> {t(locale, "admin_login")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
              {companyApiMode && (
                <Pagination page={companySearch.page} pageCount={companySearch.pageCount} total={companySearch.total} pageSize={companySearch.pageSize} onPage={companySearch.setPage} noun={t(locale, "admin_noun_company")} nounPlural={t(locale, "admin_noun_companies")} />
              )}
            </div>
          )}

          {/* ── Services (categories) ── */}
          {tab === "services" && (
            <div className="space-y-4">
              <SearchInput value={categoryQuery} onChange={setCategoryQuery} placeholder={t(locale, "admin_categories_search")} />
              <p className="text-[14px] text-outline">
                <span className="font-black text-on-surface">{filteredCategories.length}</span>
                {catq ? ` ${t(locale, "admin_cat_of")} ${categories.length}` : ""} {t(locale, "admin_noun_categories")}
              </p>
              {filteredCategories.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, "admin_categories_none")} icon="search_off" /></div>
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
                        <p className="text-[12px] text-outline">{cat.count} {t(locale, "admin_companies_count")}</p>
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

          {/* ── Provider change requests ── */}
          {tab === "changes" && <ChangeRequestsTab />}

          {/* ── Conversations ── */}
          {tab === "chat" && <ChatTab />}

          {/* ── Site status (maintenance) ── */}
          {tab === "status" && <SiteStatusTab />}

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
      {selectedWaitlist && (
        <WaitlistDetailModal
          entry={selectedWaitlist}
          onClose={() => setSelectedWaitlist(null)}
          onStatusChange={(id, s) => { handleWaitlistStatus(selectedWaitlist, s); setSelectedWaitlist((e) => (e && e.id === id ? { ...e, status: s } : e)); }}
          onDelete={() => { handleWaitlistDelete(selectedWaitlist); setSelectedWaitlist(null); }}
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
