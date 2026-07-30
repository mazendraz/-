import { type Lead, STATUS_COLORS } from "../../lib/requests";
import { type Company } from "../../lib/catalog";
import {
  leadsPerDay, leadsByStatus, conversionFunnel, leadsByCompany,
  companyLeaderboard, periodDelta,
  statsPerDay, statsByStatus, statsFunnel, statsByCompany, statsDelta, statsConversion,
} from "../../lib/analytics";
import { useLeadStats } from "../../lib/stats";
import { isApiConfigured } from "../../lib/api";
import {
  KpiCard, ChartCard, AreaLineChart, DonutChart, FunnelChart, BarList,
} from "../../components/Charts";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import { formatDate } from "../../lib/format";
import { LEAD_STATUS_KEYS } from "../../lib/requests";

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN OVERVIEW — analytics command center
// ══════════════════════════════════════════════════════════════════════════
export function AdminOverview({
  leads, companies, categoriesCount, onOpenLead, onViewAllLeads, onGoSettings,
}: {
  leads: Lead[];
  companies: Company[];
  categoriesCount: number;
  onOpenLead: (l: Lead) => void;
  onViewAllLeads: () => void;
  onGoSettings: () => void;
}) {
  const { locale } = useLocale();
  const apiMode = isApiConfigured();
  // Whole-table aggregates in API mode. `leads` is one capped page, so counting
  // it was only ever right in demo mode — where localStorage IS the dataset.
  const { stats, loading: statsLoading } = useLeadStats({ days: 14, deltaDays: 7 });

  const total = stats ? stats.total : leads.length;
  const newCount = stats ? (stats.byStatus.New ?? 0) : leads.filter((l) => l.status === "New").length;
  const conversion = stats
    ? statsConversion(stats)
    : (leads.length
        ? Math.round((leads.filter((l) => l.status === "Completed").length / leads.length) * 100)
        : 0);
  const delta = stats ? statsDelta(stats) : periodDelta(leads, 7);

  const daily = stats ? statsPerDay(stats, locale) : leadsPerDay(leads, 14, locale);
  const spark = daily.map((d) => d.value);
  const byStatus = stats ? statsByStatus(stats, locale) : leadsByStatus(leads, locale);
  const funnel = stats ? statsFunnel(stats, locale) : conversionFunnel(leads, locale);
  const topCompanies = stats ? statsByCompany(stats, 6) : leadsByCompany(leads, 6);

  // `companies` is a clamped page in API mode (pageSize=200 → 100), so its length
  // is a page size rather than a count once the platform passes a hundred.
  const companyTotal = stats?.catalog ? stats.catalog.companies : companies.length;

  // The server already ranks by volume and computes conversion over the full
  // table; the demo path still derives it from the local list.
  const leaderboard = stats
    ? stats.byCompany
    : companyLeaderboard(companies, leads).map((p) => ({
        companyId: p.company.id,
        companyName: p.company.name,
        logo: p.company.logo,
        rating: p.company.rating,
        leads: p.leads,
        completed: p.completed,
        conversion: p.conversion,
      }));

  // Don't render an empty state over numbers that haven't arrived — the "no leads
  // yet" screen appearing for a second on a busy dashboard reads as data loss.
  if (apiMode && statsLoading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-12 text-center max-w-lg mx-auto mt-6">
        <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-primary text-[34px]">monitoring</span>
        </div>
        <h2 className="font-bold text-[18px] text-on-surface mb-1.5">{t(locale, "admin_ov_empty_title")}</h2>
        <p className="text-[14px] text-outline mb-6 leading-relaxed">
          {t(locale, "admin_ov_empty_body")}
        </p>
        {/* The demo loader only exists in demo mode — Settings hides it entirely
            once the API is configured. Offering it on a live install sent the
            admin to a screen with no such button. */}
        {!apiMode && (
          <button onClick={onGoSettings} className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">
            <span className="material-symbols-outlined text-[18px]">science</span> {t(locale, "admin_ov_load_demo")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon="inbox" label={t(locale, "admin_ov_kpi_total")} value={total} delta={delta} spark={spark} tint="#005578" />
        <KpiCard icon="fiber_new" label={t(locale, "admin_ov_kpi_new")} value={newCount} tint="#2563eb" />
        <KpiCard icon="trending_up" label={t(locale, "admin_ov_kpi_conversion")} value={`${conversion}%`} tint="#16a34a" />
        <KpiCard icon="business" label={t(locale, "admin_ov_kpi_companies")} value={companyTotal} tint="#785a02" />
      </div>

      {/* Trend + status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title={t(locale, "admin_ov_over_time")} subtitle={t(locale, "admin_ov_last_14")} className="lg:col-span-2">
          <AreaLineChart data={daily} valueLabel={t(locale, "chart_leads")} />
        </ChartCard>
        <ChartCard title={t(locale, "admin_ov_by_status")} subtitle={t(locale, "admin_ov_pipeline")}>
          <DonutChart data={byStatus} centerValue={total} centerLabel={t(locale, "chart_leads")} />
        </ChartCard>
      </div>

      {/* Funnel + by company */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t(locale, "admin_ov_funnel")} subtitle={t(locale, "admin_ov_funnel_sub")}>
          <FunnelChart stages={funnel} />
        </ChartCard>
        <ChartCard title={t(locale, "admin_ov_top_companies")}>
          <BarList data={topCompanies} valueSuffix={` ${t(locale, "chart_leads")}`} />
        </ChartCard>
      </div>

      {/* Leaderboard + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t(locale, "admin_ov_leaderboard")} subtitle={t(locale, "admin_ov_leaderboard_sub")}>
          <div className="space-y-1">
            {leaderboard.slice(0, 5).map((p, i) => (
              <div key={p.companyId} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0
                  ${i === 0 ? "bg-secondary text-on-secondary" : "bg-surface-container text-outline"}`}>{i + 1}</span>
                <img src={p.logo} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-on-surface truncate">{p.companyName}</p>
                  <p className="text-[11px] text-outline">★ {p.rating} · {p.conversion}% {t(locale, "admin_ov_conversion_suffix")}</p>
                </div>
                <span className="font-black text-[15px] text-on-surface tabular-nums flex-shrink-0">{p.leads}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title={t(locale, "admin_ov_recent")} action={<button onClick={onViewAllLeads} className="text-[13px] font-bold text-primary hover:underline">{t(locale, "admin_ov_view_all")}</button>}>
          <div className="space-y-1">
            {leads.slice(0, 6).map((l) => (
              <button key={l.id} onClick={() => onOpenLead(l)} className="w-full flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0 text-left hover:bg-surface-container/40 rounded-lg px-1 transition-colors">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${l.status === "New" ? "bg-blue-500 pulse-dot" : "bg-outline-variant"}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-on-surface truncate">{l.name} → {l.companyName}</p>
                  <p className="text-[11px] text-outline truncate">{l.service} · {formatDate(l.createdAt, locale)}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[l.status]}`}>{t(locale, LEAD_STATUS_KEYS[l.status])}</span>
              </button>
            ))}
          </div>
        </ChartCard>
      </div>

      <p className="text-[11px] text-outline text-center">{stats?.catalog ? stats.catalog.categories : categoriesCount} {t(locale, "admin_ov_footer_categories")} · {companyTotal} {t(locale, "admin_companies_count")} · {total} {t(locale, "admin_ov_footer_total")}</p>
    </div>
  );
}
