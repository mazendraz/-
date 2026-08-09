import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  useLeads, updateLeadStatus, deleteLead,
  type Lead, type LeadStatus, LEAD_STATUSES, LEAD_STATUS_KEYS,
} from "../../../lib/requests";
import { useCompanies } from "../../../lib/catalog";
import { isApiConfigured } from "../../../lib/api";
import {
  setWaitlistStatus, deleteWaitlistEntry,
  type WaitlistEntry, type WaitlistStatus,
} from "../../../lib/availability";
import { useServerSearch } from "../../../hooks/useServerSearch";
import { useMutation } from "../../../hooks/useMutation";
import SearchInput from "../../../components/SearchInput";
import Pagination from "../../../components/Pagination";
import { LeadTable, LeadMobileCard, LeadModal, WaitlistDetailModal, type LeadListRow } from "../LeadsTab";
import { EmptyState } from "../components/EmptyState";
import { Loading } from "../components/Loading";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import Select from "../../../components/Select";

export default function LeadsPage() {
  const { locale } = useLocale();
  const leads = useLeads();
  const companies = useCompanies();
  const location = useLocation();

  // Overview's "recent leads" list hands the full Lead over via navigate
  // state, so opening it here doesn't need a round trip back to the server —
  // see OverviewPage's `onOpenLead`.
  const [selectedLead, setSelectedLead] = useState<Lead | null>(
    () => (location.state as { lead?: Lead } | null)?.lead ?? null,
  );
  const [selectedWaitlist, setSelectedWaitlist] = useState<WaitlistEntry | null>(null);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "All" | "Waitlist">("All");
  const [filterCompany, setFilterCompany] = useState("all");
  const [leadQuery, setLeadQuery] = useState("");

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
  // perfectly unified cross-table sort isn't worth the complexity. Because of
  // that, `waitlistSearch`'s own page never advances past 1 in mixed mode (no
  // Pagination control below is wired to it there) — see the page-1 guard on
  // `waitlistRows` below, which stops that fixed page-1 slice from being
  // silently re-merged as duplicate rows into every subsequent lead page.
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
  // In mixed mode (both sources shown, paginated by leadSearch alone) only fold
  // the waitlist's page-1 slice in on the leads' own page 1 — otherwise the same
  // fixed slice would reappear as duplicates on every later lead page, since
  // there is no control that ever advances waitlistSearch past page 1 here.
  const waitlistRows: LeadListRow[] = showLeads && showWaitlist && leadSearch.page > 1
    ? []
    : waitlistList.map((data) => ({ kind: "waitlist", data }) as const);
  const mergedRows: LeadListRow[] = showLeads && showWaitlist
    ? [...leadRows, ...waitlistRows].sort((a, b) => b.data.createdAt - a.data.createdAt)
    : showWaitlist ? waitlistRows : leadRows;
  const displayedTotal = showLeads && showWaitlist ? leadTotal + waitlistTotal : showWaitlist ? waitlistTotal : leadTotal;
  // Refetch (filter/search/page change) with a previous page already on screen (CMP-03).
  const leadsRefetching = leadApiMode && (leadSearch.loading || waitlistSearch.loading) && mergedRows.length > 0;

  const handleOpenRow = (row: LeadListRow) => {
    if (row.kind === "lead") setSelectedLead(row.data);
    else setSelectedWaitlist(row.data);
  };

  // Mutations refresh the server page (after the PATCH/DELETE settles) so the
  // visible rows reflect the change even though they came from the backend.
  // UX-06: these used to be fire-and-forget — no pending state, no `.catch`,
  // no rollback. A PATCH that failed (network drop, 500) was swallowed
  // entirely; the row just sat on stale data with no explanation.
  //
  // The status-change mutations also optimistically patch `selectedLead` /
  // `selectedWaitlist` (the open detail modal shows the new status the
  // instant it's picked, not after the refetch) — a failure restores the
  // modal's previous value too, so it can't disagree with the table.
  const leadStatusMutation = useMutation<{ id: string; status: LeadStatus }>({
    mutate: ({ id, status }) => updateLeadStatus(id, status),
    optimisticUpdate: ({ id, status }) => {
      const prev = selectedLead;
      if (prev?.id === id) setSelectedLead({ ...prev, status });
      return () => { if (prev?.id === id) setSelectedLead(prev); };
    },
    // Patch the row in place first — instant feedback instead of waiting on a
    // full re-fetch — then refresh so filter membership/sort stay correct
    // (e.g. the row leaving a status-filtered view entirely).
    onSuccess: ({ id, status }) => {
      if (!leadApiMode) return;
      leadSearch.patch((l) => l.id === id, (l) => ({ ...l, status }));
      leadSearch.refresh();
    },
    errorMessage: t(locale, "admin_mutation_failed"),
  });
  const leadDeleteMutation = useMutation<string>({
    mutate: (id) => deleteLead(id),
    onSuccess: () => { if (leadApiMode) leadSearch.refresh(); },
    errorMessage: t(locale, "admin_delete_failed"),
  });
  const waitlistStatusMutation = useMutation<{ entry: WaitlistEntry; status: WaitlistStatus }>({
    mutate: ({ entry, status }) => setWaitlistStatus({ kind: "admin", companyId: entry.companyId }, entry.id, status),
    optimisticUpdate: ({ entry, status }) => {
      const prev = selectedWaitlist;
      if (prev?.id === entry.id) setSelectedWaitlist({ ...prev, status });
      return () => { if (prev?.id === entry.id) setSelectedWaitlist(prev); };
    },
    // Accepting (status -> CONVERTED) creates a real Lead behind this entry (see
    // waitlist.service.ts convertToLead) — refresh the lead list too, so the row
    // that was tagged "waitlist" reappears immediately as a normal lead instead of
    // only showing up after the next full reload.
    onSuccess: ({ entry, status }) => {
      waitlistSearch.patch((e) => e.id === entry.id, (e) => ({ ...e, status }));
      waitlistSearch.refresh();
      if (status === "CONVERTED" && leadApiMode) leadSearch.refresh();
    },
    errorMessage: t(locale, "admin_mutation_failed"),
  });
  const waitlistDeleteMutation = useMutation<WaitlistEntry>({
    mutate: (entry) => deleteWaitlistEntry({ kind: "admin", companyId: entry.companyId }, entry.id),
    onSuccess: () => waitlistSearch.refresh(),
    errorMessage: t(locale, "admin_delete_failed"),
  });
  const handleLeadStatus = (id: string, status: LeadStatus) => { void leadStatusMutation.run({ id, status }); };
  const handleLeadDelete = (id: string) => { void leadDeleteMutation.run(id); };
  const handleWaitlistStatus = (entry: WaitlistEntry, status: WaitlistStatus) => { void waitlistStatusMutation.run({ entry, status }); };
  const handleWaitlistDelete = (entry: WaitlistEntry) => { void waitlistDeleteMutation.run(entry); };

  // A deep-linked lead (from Overview) isn't necessarily on the currently
  // loaded server page — refresh once so the table behind the modal has a
  // chance to include it, without blocking the modal itself on that refetch.
  useEffect(() => {
    if (selectedLead && leadApiMode) leadSearch.refresh();
    // Only on mount — a deliberate one-shot reconciliation, not a dependency
    // on `selectedLead` changing from user interaction afterward.
  }, []);

  return (
    <div className="space-y-4">
      <SearchInput value={leadQuery} onChange={setLeadQuery} placeholder={t(locale, "admin_leads_search")} />
      <div className="flex flex-wrap gap-3 items-center">
        {/* Found while closing out Phase 5: unnamed to a screen reader — no
            visible label, no aria-label, same class of bug as DM-06b's lead
            row selects, just on the filter row above them instead. */}
        <Select
          className="!w-auto"
          triggerClassName="field-input !w-auto !py-2 !min-h-[44px] flex items-center justify-between gap-2 text-start touch-press"
          value={filterStatus}
          onChange={(v) => setFilterStatus(v as LeadStatus | "All" | "Waitlist")}
          ariaLabel={t(locale, "admin_lead_status")}
          options={[
            { value: "All", label: t(locale, "admin_all_statuses") },
            ...LEAD_STATUSES.map((s) => ({ value: s, label: t(locale, LEAD_STATUS_KEYS[s]) })),
            { value: "Waitlist", label: t(locale, "requests_filter_waitlist") },
          ]}
        />
        <Select
          className="!w-auto"
          triggerClassName="field-input !w-auto !py-2 !min-h-[44px] flex items-center justify-between gap-2 text-start touch-press"
          value={filterCompany}
          onChange={setFilterCompany}
          ariaLabel={t(locale, "admin_chat_filter_company")}
          options={[
            { value: "all", label: t(locale, "admin_all_companies") },
            ...companies.map((c) => ({ value: c.slug, label: c.name })),
          ]}
        />
        <span className="text-label font-bold text-outline ms-auto" role="status" aria-live="polite" aria-atomic="true">{displayedTotal} {tCount(locale, "noun_lead", displayedTotal)}</span>
      </div>
      {leadApiMode && (leadSearch.error || waitlistSearch.error) && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{leadSearch.error || waitlistSearch.error}</div>
      )}
      {mergedRows.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
          {leadApiMode && (leadSearch.loading || waitlistSearch.loading)
            ? <Loading msg={t(locale, "admin_searching")} />
            : <EmptyState msg={t(locale, "admin_leads_none")} icon="search_off" />}
        </div>
      ) : (
        <>
          {/* RESP-02: the table has 6 columns — at 768px next to the 256px admin
              sidebar that leaves ~470px to render all of them in, which is what
              was cramming the table rather than the mobile cards. Table now
              waits for lg:, matching the sidebar's own reflow point. */}
          <div
            className={`hidden lg:block bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden transition-opacity ${leadsRefetching ? "opacity-60 pointer-events-none" : ""}`}
            aria-busy={leadsRefetching}
          >
            <LeadTable rows={mergedRows} onOpen={handleOpenRow} onLeadStatusChange={handleLeadStatus} onWaitlistStatusChange={handleWaitlistStatus} />
          </div>
          {/* Mobile + tablet cards. sm:grid-cols-2 so tablet gets a 1→2→3 progression
              instead of a single narrow column stretched across the whole width. */}
          <div className={`lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity ${leadsRefetching ? "opacity-60 pointer-events-none" : ""}`} aria-busy={leadsRefetching}>
            {mergedRows.map((row) => <LeadMobileCard key={`${row.kind}-${row.data.id}`} row={row} onOpen={handleOpenRow} />)}
          </div>
        </>
      )}
      {leadApiMode && (
        showWaitlist && !showLeads
          ? <Pagination page={waitlistSearch.page} pageCount={waitlistSearch.pageCount} total={waitlistSearch.total} pageSize={waitlistSearch.pageSize} onPage={waitlistSearch.setPage} nounKey="noun_lead" />
          : <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} nounKey="noun_lead" />
      )}

      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={handleLeadStatus}
          onDelete={(id) => { handleLeadDelete(id); setSelectedLead(null); }}
        />
      )}
      {selectedWaitlist && (
        <WaitlistDetailModal
          entry={selectedWaitlist}
          onClose={() => setSelectedWaitlist(null)}
          onStatusChange={(_id, s) => handleWaitlistStatus(selectedWaitlist, s)}
          onDelete={() => { handleWaitlistDelete(selectedWaitlist); setSelectedWaitlist(null); }}
        />
      )}
    </div>
  );
}
