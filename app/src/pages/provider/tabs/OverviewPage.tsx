import { Link, useNavigate } from "react-router-dom";
import { KpiCard, ChartCard, AreaLineChart, DonutChart } from "../../../components/Charts";
import { CHART_COLORS } from "../../../lib/chartColors";
import { isBusy, formatReopenDate, availableAgainAt } from "../../../lib/availability";
import { LeadMobileCard, LeadModal, WaitlistDetailModal, type LeadListRow } from "../../admin/LeadsTab";
import EmptyState from "../../../components/EmptyState";
import Icon from "../../../components/Icon";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { formatRating } from "../../../lib/format";
import { useProvider } from "../context";
import { useProviderCharts } from "../useProviderCharts";
import { useProviderLeadActions } from "../useProviderLeadActions";
import LeadRows from "../LeadRows";

export default function OverviewPage() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { company, leads, stats } = useProvider();
  const { daily, byStatus, delta, conversion } = useProviderCharts();
  const {
    selectedLead, setSelectedLead, selectedWaitlist, setSelectedWaitlist, openRow,
    handleLeadStatus, handleWaitlistStatus, handleWaitlistDelete,
  } = useProviderLeadActions();

  const busyNow = isBusy(company);
  // Resolved across the manual switch AND any running scheduled window, so a
  // provider busy because of a scheduled period still sees their return date.
  const backAt = availableAgainAt(company);
  const recentRows: LeadListRow[] = leads.slice(0, 5).map((data) => ({ kind: "lead", data }) as const);

  return (
    <>
    <div className="space-y-5">
      {/* Availability banner */}
      <button onClick={() => navigate("/provider/availability")}
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
        <KpiCard icon="inbox" label={t(locale, "prov_kpi_total_leads")} value={stats.total} delta={delta} spark={daily.map((d) => d.value)} tint={CHART_COLORS.primary} onClick={() => navigate("/provider/leads")} />
        <KpiCard icon="fiber_new" label={t(locale, "prov_kpi_new_leads")} value={stats.new} tint={CHART_COLORS.blue} onClick={() => navigate("/provider/leads", { state: { status: "New" } })} />
        <KpiCard icon="trending_up" label={t(locale, "prov_kpi_conversion")} value={stats.total ? `${conversion}%` : "—"} tint={CHART_COLORS.green} onClick={() => navigate("/provider/analytics")} />
        <KpiCard icon="grade" label={t(locale, "prov_kpi_rating")} value={formatRating(locale, company.rating)} tint={CHART_COLORS.secondary} onClick={() => navigate("/provider/reviews")} />
      </div>

      {/* Trend + status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title={t(locale, "prov_chart_leads_over_time")} subtitle={t(locale, "prov_chart_last_14")} className="lg:col-span-2"
          action={<Link to={`/companies/${company.slug}`} target="_blank" className="text-label font-bold text-primary hover:underline flex items-center gap-1">{t(locale, "prov_public_profile")} <Icon name="open_in_new" className="text-label" /></Link>}>
          <AreaLineChart data={daily} valueLabel={t(locale, "chart_leads")} />
        </ChartCard>
        <ChartCard title={t(locale, "prov_chart_by_status")} subtitle={t(locale, "prov_chart_pipeline")}>
          <DonutChart
            data={byStatus}
            centerValue={stats.total}
            centerLabel={t(locale, "chart_leads")}
            onSegmentClick={(seg) => seg.key && navigate("/provider/leads", { state: { status: seg.key } })}
          />
        </ChartCard>
      </div>

      {/* Recent leads */}
      <ChartCard title={t(locale, "prov_chart_recent_leads")} action={<Link to="/provider/leads" className="text-label font-bold text-primary hover:underline">{t(locale, "common_view_all")}</Link>}>
        {leads.length === 0 ? (
          <EmptyState msg={t(locale, "prov_overview_empty")} icon="inbox" />
        ) : (
          <>
            <div className="hidden lg:block">
              <LeadRows
                rows={recentRows}
                onOpen={openRow}
                onLeadStatusChange={handleLeadStatus}
                onWaitlistStatusChange={handleWaitlistStatus}
                onWaitlistDelete={handleWaitlistDelete}
                onComplete={(lead) => navigate(`/provider/leads/${lead.id}/complete`, { state: { lead } })}
              />
            </div>
            {/* One column even at sm: this sits inside a ChartCard that is
                itself one third of a grid on desktop — a 2-up card grid in
                here would be narrower than the phone case. */}
            <div className="lg:hidden grid grid-cols-1 gap-3">
              {recentRows.map((row) => (
                <LeadMobileCard key={`${row.kind}-${row.data.id}`} row={row} onOpen={openRow} />
              ))}
            </div>
          </>
        )}
      </ChartCard>
    </div>

    {selectedLead && (
      <LeadModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onStatusChange={handleLeadStatus}
        onComplete={() => navigate(`/provider/leads/${selectedLead.id}/complete`, { state: { lead: selectedLead } })}
        // No onDelete: a provider can't delete a lead. That was true of the
        // desktop rows too — layout changed, capabilities did not.
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
