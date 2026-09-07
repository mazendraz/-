import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiLeadStats, ApiLeadStatus } from "@alassema/core";
import {
  colors,
  type,
  CHART_COLORS,
  statsByStatus,
  statsConversion,
  statsDelta,
  statsFunnel,
} from "@alassema/core";
import { ApiError, rowStart, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchProviderStats } from "../lib/leads";
import { fetchAdminStats } from "../lib/adminLeads";
import { useStaffAuth } from "../lib/staffAuth";
import { isAdmin, hasCompany } from "../lib/permissions";
import KpiTile from "../components/KpiTile";
import TrendChart, { type TrendPoint } from "../components/TrendChart";
import DonutChart, { type DonutSlice } from "../components/DonutChart";
import FunnelBar, { type FunnelStep } from "../components/FunnelBar";
import RangeChips, { RANGES, type Range } from "../components/RangeChips";
import ExpandedChart from "../components/ExpandedChart";
import Icon from "../components/Icon";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

/**
 * Analytics — one screen, both roles.
 *
 * ── Why it isn't split by role ─────────────────────────────────────────────
 * `/provider/stats` and `/admin/stats` return the SAME `ApiLeadStats` shape;
 * the admin one additionally populates `byCompany` and `catalog`, which the
 * provider endpoint leaves empty/absent by design (a provider must not see
 * another company's numbers — the server scopes from the session, never a
 * param). So the difference is data, not layout: the shared sections render
 * from identical fields, and the admin-only sections render only when their
 * fields are actually present. That is also what keeps the two roles feeling
 * like one product rather than two apps.
 *
 * ── Everything here is server-aggregated ───────────────────────────────────
 * No lead lists are downloaded to compute a chart. The range chips change the
 * QUERY (`?days=&months=&deltaDays=`), the server re-aggregates, and every
 * number on screen moves together because they all come from the one payload.
 *
 * ── The formulas are not defined here ──────────────────────────────────────
 * `statsConversion`, `statsFunnel`, `statsDelta` and `statsByStatus` come from
 * `@alassema/core` — the same functions the website's provider dashboard uses.
 * A provider comparing the web dashboard and the app must never see two
 * different conversion rates.
 */

const STATUS_LABELS: Record<ApiLeadStatus, string> = {
  New: "جديد",
  Contacted: "تم التواصل",
  "In Progress": "قيد التنفيذ",
  Completed: "مكتمل",
  Cancelled: "ملغي",
};

const FUNNEL_LABELS = {
  received: "وصل",
  contacted: "تم التواصل",
  inProgress: "قيد التنفيذ",
  completed: "مكتمل",
} as const;

/** Funnel stage → the lead status its drill-down should filter by. `received`
 *  has no single status (it is every lead), so it opens the unfiltered list. */
const FUNNEL_STATUS: Record<string, ApiLeadStatus | undefined> = {
  received: undefined,
  contacted: "Contacted",
  inProgress: "In Progress",
  completed: "Completed",
};

export default function Analytics() {
  const { user } = useStaffAuth();
  const admin = isAdmin(user);
  const [range, setRange] = useState<Range>(RANGES[1]); // 30 days
  // Which chart, if any, is open full-screen. One piece of state for all of
  // them — only one can be open at a time.
  const [expanded, setExpanded] = useState<null | "trend" | "status" | "funnel">(null);
  const [stats, setStats] = useState<ApiLeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setError(null);
        setLoading(true);
      }
      try {
        const query = { days: range.days, months: range.months, deltaDays: range.days };
        setStats(admin ? await fetchAdminStats(query) : await fetchProviderStats(query));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل التحليلات. جرّب تاني.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [admin, range],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  const leadsHref = admin ? "/(admin)/leads" : "/(provider)/leads";
  function openLeads(status?: ApiLeadStatus) {
    router.push((status ? `${leadsHref}?status=${encodeURIComponent(status)}` : leadsHref) as never);
  }

  // A provider with no company has no data source at all — the endpoint 400s.
  // Say so plainly instead of rendering a screen full of zeroes.
  if (!admin && !hasCompany(user)) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "التحليلات" }} />
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <EmptyCard
            title="حسابك لسه مش مربوط بشركة"
            message="كلّم الأدمن عشان يربط حسابك بشركتك — بعدها هتلاقي تحليلات أدائك هنا."
          />

        </SafeAreaView>
      </>
    );
  }

  const hasData = (stats?.total ?? 0) > 0;
  const slices: DonutSlice[] = stats
    ? statsByStatus(stats).map((s) => ({
        key: s.status,
        label: STATUS_LABELS[s.status],
        value: s.value,
        color: s.color,
      }))
    : [];
  const funnel: FunnelStep[] = stats
    ? statsFunnel(stats).map((s) => ({ key: s.key, label: FUNNEL_LABELS[s.key], value: s.value }))
    : [];
  const trend: TrendPoint[] = stats
    ? stats.perDay.map((b) => ({ date: b.date, label: b.date.slice(5), value: b.count }))
    : [];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "التحليلات" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <RangeChips value={range} onChange={setRange} />

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => void load()} />
        ) : !hasData ? (
          // A brand-new provider sees a way forward, not a wall of zeroes.
          <View style={styles.emptyWrap}>
            <EmptyCard
              title="ابدأ استقبال طلباتك"
              message="أول ما يوصل طلب، هتلاقي هنا تحليلات أداء نشاطك — الطلبات على مدار الوقت، الحالات، ومعدل الإنجاز."
            />
            <Pressable style={styles.cta} onPress={() => openLeads()} accessibilityRole="button">
              <Text style={styles.ctaText}>عرض الطلبات</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load(true);
                }}
              />
            }
          >
            {/* ── Scope, stated explicitly ────────────────────────────────
                `total` and `byStatus` are WHOLE-TABLE counts — the server does
                not window them, and `statsConversion` is documented as a rate
                over every lead ever. Sitting directly under a range selector
                they would read as "in the last 30 days", which they are not.
                The heading says which is which; the trend card below carries
                the genuinely period-scoped number ("الإجمالي في الفترة"). */}
            <Text style={styles.scopeLabel}>الإجمالي الكلي</Text>
            <View style={styles.kpiRow}>
              <KpiTile
                label="إجمالي الطلبات"
                value={stats!.total}
                deltaPercent={statsDelta(stats!)}
                onPress={() => openLeads()}
                accessibilityHint="يفتح كل الطلبات"
              />
              <KpiTile
                label="مكتمل"
                value={stats!.byStatus.Completed ?? 0}
                onPress={() => openLeads("Completed")}
                accessibilityHint="يفتح الطلبات المكتملة"
              />
            </View>
            <View style={styles.kpiRow}>
              <KpiTile
                label="جديد"
                value={stats!.byStatus.New ?? 0}
                onPress={() => openLeads("New")}
                accessibilityHint="يفتح الطلبات الجديدة"
              />
              {/* Conversion has no list to open — completion rate is a ratio
                  over every lead, not a filter the API exposes. It stays a
                  display-only tile rather than pretending to be a link. */}
              <KpiTile label="معدل الإنجاز" value={`${statsConversion(stats!)}%`} />
            </View>

            <Text style={styles.scopeLabel}>في الفترة المختارة</Text>
            <Section
              title="الطلبات على مدار الوقت"
              subtitle="اضغط للتكبير والتفاعل"
              onExpand={() => setExpanded("trend")}
            >
              <TrendChart
                points={trend}
                color={CHART_COLORS.primary}
                onSelect={() => openLeads()}
                actionLabel="عرض الطلبات"
              />
            </Section>

            <Section
              title="حالات الطلبات"
              subtitle="اضغط للتكبير والتفاعل"
              onExpand={() => setExpanded("status")}
            >
              <DonutChart
                slices={slices}
                centerLabel="إجمالي"
                onSelect={(s) => openLeads(s.key as ApiLeadStatus)}
                actionLabel={(s) => `عرض طلبات: ${s.label}`}
              />
            </Section>

            <Section
              title="مسار التحويل"
              subtitle="اضغط للتكبير · كل مرحلة بتشمل اللي بعدها"
              onExpand={() => setExpanded("funnel")}
            >
              {/* No `onSelect` on the compact card: the body is
                  `pointerEvents="none"` (see Section), so a pressable row here
                  would render its chevron and its pressed state over a tap
                  that can only ever open the full-screen view. The drill-down
                  lives in the expanded funnel below, where it works. */}
              <FunnelBar steps={funnel} />
            </Section>

            {/* Admin-only: byCompany is empty on the provider endpoint, so this
                renders for an admin and simply doesn't exist for a provider —
                no role check needed beyond the data itself. */}
            {stats!.byCompany.length > 0 ? (
              <Section title="أعلى الشركات" subtitle="حسب عدد الطلبات">
                <View style={styles.companyList}>
                  {stats!.byCompany.slice(0, 6).map((c) => (
                    <Pressable
                      key={c.companyId}
                      style={({ pressed }) => [styles.companyRow, pressed && styles.rowPressed]}
                      onPress={() => router.push(`/company/${c.companyId}` as never)}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.companyName}: ${c.leads}`}
                    >
                      <Text style={styles.companyName} numberOfLines={1}>
                        {c.companyName}
                      </Text>
                      <View style={styles.companyMeta}>
                        <Text style={styles.companyConv}>{c.conversion}%</Text>
                        <Text style={styles.companyLeads}>{c.leads}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </Section>
            ) : null}

            {stats!.catalog ? (
              <View style={styles.kpiRow}>
                <KpiTile
                  label="شركات نشطة"
                  value={`${stats!.catalog.activeCompanies} / ${stats!.catalog.companies}`}
                  onPress={() => router.push("/(admin)/companies" as never)}
                  accessibilityHint="يفتح الشركات"
                />
                <KpiTile
                  label="تصنيفات"
                  value={stats!.catalog.categories}
                  onPress={() => router.push("/categories" as never)}
                  accessibilityHint="يفتح التصنيفات"
                />
              </View>
            ) : null}

            <Pressable style={styles.cta} onPress={() => openLeads()} accessibilityRole="button">
              <Text style={styles.ctaText}>عرض كل الطلبات</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* ── The same charts, full-screen ────────────────────────────────
            Each one is the SAME component with more room and a taller/larger
            size, reading the SAME `stats` the screen already fetched — never a
            second copy of the maths. Selection state lives inside each chart,
            so an expanded chart starts fresh and the small one behind it keeps
            whatever the user had selected. */}
        <ExpandedChart
          visible={expanded === "trend"}
          title="الطلبات على مدار الوقت"
          subtitle="اسحب إصبعك على الخط لاستعراض كل يوم"
          onClose={() => setExpanded(null)}
        >
          <TrendChart
            points={trend}
            color={CHART_COLORS.primary}
            height={340}
            gridSteps={5}
            onSelect={() => {
              setExpanded(null);
              openLeads();
            }}
            actionLabel="عرض الطلبات"
          />
        </ExpandedChart>

        <ExpandedChart
          visible={expanded === "status"}
          title="حالات الطلبات"
          subtitle="اضغط على أي جزء من الحلقة، أو على القائمة"
          onClose={() => setExpanded(null)}
        >
          <DonutChart
            slices={slices}
            centerLabel="إجمالي"
            size={260}
            stacked
            onSelect={(sl) => {
              setExpanded(null);
              openLeads(sl.key as ApiLeadStatus);
            }}
            actionLabel={(sl) => `عرض طلبات: ${sl.label}`}
          />
        </ExpandedChart>

        <ExpandedChart
          visible={expanded === "funnel"}
          title="مسار التحويل"
          subtitle="اضغط أي مرحلة لعرض طلباتها · كل مرحلة بتشمل اللي بعدها"
          onClose={() => setExpanded(null)}
        >
          <FunnelBar
            steps={funnel}
            onSelect={(step) => {
              setExpanded(null);
              openLeads(FUNNEL_STATUS[step.key ?? ""]);
            }}
          />
        </ExpandedChart>
      </SafeAreaView>
    </>
  );
}

function Section({
  title,
  subtitle,
  onExpand,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Opens this chart full-screen. Omit for a section that has nothing more
   *  to show at a larger size. */
  onExpand?: () => void;
  children: React.ReactNode;
}) {
  const head = (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </>
  );

  if (!onExpand) {
    return (
      <View style={styles.section}>
        {head}
        <View style={styles.sectionBody}>{children}</View>
      </View>
    );
  }

  return (
    // ── The card IS the button ──────────────────────────────────────────────
    // This used to carry a small expand icon in its corner. A chart that
    // responds to a tap only on one 20px glyph reads as a picture with a
    // control bolted on; the obvious thing to press is the chart. So the whole
    // card opens the full-screen view.
    //
    // `pointerEvents="none"` on the body is what makes that unambiguous. The
    // charts are themselves interactive — a donut slice selects, a trend point
    // selects — and leaving those live inside a pressable card would mean the
    // same tap could do two different things depending on the pixel it landed
    // on. Here the compact card is a summary you open; ALL of the interaction
    // lives in the expanded view, where there is room for it.
    <Pressable
      onPress={onExpand}
      style={({ pressed }) => [styles.section, pressed && styles.sectionPressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="يفتح الرسم البياني بالحجم الكامل"
    >
      {head}
      <View style={styles.sectionBody} pointerEvents="none">
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  kpiRow: { flexDirection: rowStart, gap: 12 },
  scopeLabel: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  sectionPressed: { backgroundColor: colors.surfaceContainer },
  section: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 16,
    gap: 2,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: type.subhead.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  sectionSubtitle: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: textStart,
  },
  sectionBody: { marginTop: 12 },
  emptyWrap: { padding: 16, gap: 16 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  ctaText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onPrimary,
  },
  companyList: { gap: 2 },
  companyRow: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 10,
    gap: 12,
  },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  companyName: {
    flex: 1,
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  companyMeta: { flexDirection: rowStart, alignItems: "center", gap: 10 },
  companyConv: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.outline,
    fontVariant: ["tabular-nums"],
  },
  companyLeads: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
});
