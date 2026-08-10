import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useServerSearch } from "../../../hooks/useServerSearch";
import { isApiConfigured } from "../../../lib/api";
import { type Lead, type LeadStatus, LEAD_STATUS_KEYS } from "../../../lib/requests";
import type { WaitlistEntry } from "../../../lib/availability";
import { LeadMobileCard, LeadModal, WaitlistDetailModal, type LeadListRow } from "../../admin/LeadsTab";
import SearchInput from "../../../components/SearchInput";
import Pagination from "../../../components/Pagination";
import { EmptyState } from "../../admin/components/EmptyState";
import { Loading } from "../../admin/components/Loading";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import { useProvider } from "../context";
import { useProviderLeadActions } from "../useProviderLeadActions";
import LeadRows from "../LeadRows";

const LEAD_FILTERS: (LeadStatus | "All" | "Waitlist")[] = ["All", "New", "Contacted", "In Progress", "Completed", "Cancelled", "Waitlist"];

export default function LeadsPage() {
  const { locale } = useLocale();
  const location = useLocation();
  const { leads, stats } = useProvider();
  const leadApiMode = isApiConfigured();

  const [leadQuery, setLeadQuery] = useState("");
  // Overview's KPI/donut drill-downs hand a status over via navigate state
  // (same idiom as admin's LeadsPage) instead of a URL param.
  const [leadStatus, setLeadStatus] = useState<LeadStatus | "All" | "Waitlist">(
    () => (location.state as { status?: LeadStatus } | null)?.status ?? "All",
  );

  // A specific Lead status only ever matches leads (a waitlist join has no
  // Lead status); "Waitlist" only ever matches waitlist entries — each source
  // is only fetched when it can actually contribute rows to the current filter.
  const showLeads = leadStatus !== "Waitlist";
  const showWaitlist = leadStatus === "All" || leadStatus === "Waitlist";

  const leadSearch = useServerSearch<Lead>(
    "/provider/leads",
    leadQuery,
    { status: showLeads && leadStatus !== "All" ? leadStatus : undefined },
    { pageSize: 20, enabled: leadApiMode && showLeads },
  );
  // The provider's own waiting-list joins — merged into the same tab, tagged
  // and colored differently. Pagination stays driven by leadSearch when both
  // are shown together: real volume here is small (it only accumulates while
  // the company is busy), so a unified cross-source sort isn't worth it.
  // Because of that, `waitlistSearch`'s own page never advances past 1 in
  // mixed mode (no Pagination control below is wired to it there) — see the
  // page-1 guard on `waitlistRows` below, which stops that fixed page-1 slice
  // from being silently re-merged as duplicate rows into every later lead page.
  const waitlistSearch = useServerSearch<WaitlistEntry>(
    "/provider/waitlist",
    leadQuery,
    {},
    { pageSize: 20, enabled: leadApiMode && showWaitlist },
  );

  const {
    selectedLead, setSelectedLead, selectedWaitlist, setSelectedWaitlist, openRow: handleOpenRow,
    handleLeadStatus, handleWaitlistStatus, handleWaitlistDelete,
  } = useProviderLeadActions({
    // Patch the row in place first — instant feedback instead of waiting on a
    // full re-fetch — then refresh so filter membership/sort stay correct
    // (e.g. the row leaving a status-filtered view entirely).
    onLeadChanged: (id, status) => {
      if (!leadApiMode) return;
      leadSearch.patch((l) => l.id === id, (l) => ({ ...l, status }));
      leadSearch.refresh();
    },
    // Accepting (status -> CONVERTED) creates a real Lead behind this entry
    // (waitlist.service.ts convertToLead) — refresh the lead list too, so the
    // row tagged "waitlist" reappears immediately as a normal lead instead of
    // only showing up after the next full reload.
    onWaitlistChanged: (entry, status) => {
      waitlistSearch.patch((e) => e.id === entry.id, (e) => ({ ...e, status }));
      waitlistSearch.refresh();
      if (status === "CONVERTED" && leadApiMode) leadSearch.refresh();
    },
    onWaitlistDeleted: () => waitlistSearch.refresh(),
  });

  const lq = leadQuery.trim().toLowerCase();
  const filteredLeads = leads.filter((l) => {
    const matchStatus = leadStatus === "All" || l.status === leadStatus;
    const matchQuery = !lq || [l.name, l.phone, l.refNumber, l.service, l.district].some((v) => v.toLowerCase().includes(lq));
    return matchStatus && matchQuery;
  });
  const leadList = leadApiMode ? leadSearch.data : filteredLeads;
  const leadTotal = leadApiMode ? leadSearch.total : filteredLeads.length;
  const waitlistList = leadApiMode ? waitlistSearch.data : [];
  const waitlistTotal = leadApiMode ? waitlistSearch.total : 0;

  const leadRows: LeadListRow[] = leadList.map((data) => ({ kind: "lead", data }) as const);
  // Converted entries already have their own row in leadRows (the Lead they
  // became) — keep them out of the merged pipeline view so the same customer
  // doesn't appear twice. Still visible, including Converted, from
  // WaitlistManager's own status filter on the Availability tab.
  // In mixed mode (both sources shown, paginated by leadSearch alone) only fold
  // the waitlist's page-1 slice in on the leads' own page 1 — otherwise the
  // same fixed slice would reappear as duplicates on every later lead page.
  const waitlistRows: LeadListRow[] = showLeads && showWaitlist && leadSearch.page > 1
    ? []
    : waitlistList
        .filter((e) => e.status !== "CONVERTED")
        .map((data) => ({ kind: "waitlist", data }) as const);
  const mergedRows: LeadListRow[] = showLeads && showWaitlist
    ? [...leadRows, ...waitlistRows].sort((a, b) => b.data.createdAt - a.data.createdAt)
    : showWaitlist ? waitlistRows : leadRows;
  const displayedTotal = showLeads && showWaitlist ? leadTotal + waitlistTotal : showWaitlist ? waitlistTotal : leadTotal;
  const leadsRefetching = leadApiMode && (leadSearch.loading || waitlistSearch.loading) && mergedRows.length > 0;

  return (
    <>
            <div className="space-y-4">
              <SearchInput value={leadQuery} onChange={setLeadQuery} placeholder={t(locale, "prov_leads_search_ph")} />
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {LEAD_FILTERS.map((f) => (
                  <button key={f} onClick={() => setLeadStatus(f)}
                    className={`flex-shrink-0 px-3.5 py-1.5 min-h-[44px] rounded-full text-label font-bold transition-colors border ${
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
              {mergedRows.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
                  {leadApiMode && (leadSearch.loading || waitlistSearch.loading) ? (
                    <Loading msg={t(locale, "admin_searching")} />
                  ) : (
                    <EmptyState
                      msg={(lq || leadStatus !== "All") ? t(locale, "prov_leads_no_match") : t(locale, "prov_leads_empty")}
                      icon={(lq || leadStatus !== "All") ? "search_off" : "inbox"}
                    />
                  )}
                </div>
              ) : (
                <>
                  {/* DM-03: the inline row layout needs room for a status
                      select AND a date column beside the lead's details — at
                      390px that left ~224px for everything else. Same lg:
                      split the admin Leads tab already uses (RESP-02). */}
                  <div
                    className={`hidden lg:block bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden transition-opacity ${leadsRefetching ? "opacity-60 pointer-events-none" : ""}`}
                    aria-busy={leadsRefetching}
                  >
                    <LeadRows rows={mergedRows} onOpen={handleOpenRow} onLeadStatusChange={handleLeadStatus} onWaitlistStatusChange={handleWaitlistStatus} onWaitlistDelete={handleWaitlistDelete} />
                  </div>
                  <div
                    className={`lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity ${leadsRefetching ? "opacity-60 pointer-events-none" : ""}`}
                    aria-busy={leadsRefetching}
                  >
                    {mergedRows.map((row) => (
                      <LeadMobileCard key={`${row.kind}-${row.data.id}`} row={row} onOpen={handleOpenRow} />
                    ))}
                  </div>
                </>
              )}
              {leadApiMode && (
                showWaitlist && !showLeads
                  ? <Pagination page={waitlistSearch.page} pageCount={waitlistSearch.pageCount} total={waitlistSearch.total} pageSize={waitlistSearch.pageSize} onPage={waitlistSearch.setPage} nounKey="noun_lead" />
                  : <Pagination page={leadSearch.page} pageCount={leadSearch.pageCount} total={leadSearch.total} pageSize={leadSearch.pageSize} onPage={leadSearch.setPage} nounKey="noun_lead" />
              )}
            </div>

    {selectedLead && (
      <LeadModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onStatusChange={handleLeadStatus}
        // No onDelete: a provider can't delete a lead.
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
    </>
  );
}
