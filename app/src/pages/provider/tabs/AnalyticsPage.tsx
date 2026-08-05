import { KpiCard, ChartCard, AreaLineChart, DonutChart, FunnelChart, BarChart } from "../../../components/Charts";
import { CHART_COLORS } from "../../../lib/chartColors";
import Icon from "../../../components/Icon";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { useProvider } from "../context";
import { useProviderCharts } from "../useProviderCharts";

export default function AnalyticsPage() {
  const { locale } = useLocale();
  const { company, stats } = useProvider();
  const { daily, byStatus, funnel, monthly, conversion } = useProviderCharts();

  return (
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
  );
}
