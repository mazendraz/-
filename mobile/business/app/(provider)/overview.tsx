import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCompany, ApiLead, ApiLeadStats } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, rowStart, textStart, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchLeads, fetchProviderStats } from "../../lib/leads";
import { fetchProfile } from "../../lib/profile";
import { useStaffAuth } from "../../lib/staffAuth";
import { hasCompany } from "../../lib/permissions";
import KpiTile from "../../components/KpiTile";
import LeadRow from "../../components/LeadRow";
import LeadsChart from "../../components/LeadsChart";
import ScreenHeader from "../../components/ScreenHeader";
import SectionHeader from "../../components/SectionHeader";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

export default function ProviderOverview() {
  const { user } = useStaffAuth();
  const [stats, setStats] = useState<ApiLeadStats | null>(null);
  const [recentLeads, setRecentLeads] = useState<ApiLead[] | null>(null);
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      // The profile rides along so the screen can open with the business's own
      // identity rather than an anonymous grid of numbers — a provider should
      // see "this is my company, here is its state", not "here are statistics".
      // Settled with allSettled: identity is context, and losing it must never
      // cost the provider their leads.
      const [statsResult, leadsResult, profileResult] = await Promise.all([
        fetchProviderStats(),
        fetchLeads({ page: 1, pageSize: 5 }),
        fetchProfile().catch(() => null),
      ]);
      setStats(statsResult);
      setRecentLeads(leadsResult.data);
      setCompany(profileResult?.company ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل البيانات. جرّب تاني.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hasCompany(user)) void load();
    else setLoading(false);
  }, [load, user]);

  useRefreshOnFocus(() => {
    if (hasCompany(user)) void load(true);
  });

  useLiveEvents((event) => {
    if ((event.type === "lead" || event.type === "lead-status") && hasCompany(user)) {
      void load(true);
    }
  });

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="الرئيسية" />

      {!hasCompany(user) ? (
        <EmptyCard
          title="حسابك لسه مش مربوط بشركة"
          message="كلّم الأدمن عشان يربط حسابك بشركتك — بعدها هتلاقي طلباتك وإحصائياتك هنا."
        />
      ) : loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ── Whose business this is ────────────────────────────────────
              The overview opens with the company, not with numbers. A grid of
              KPIs alone reads as "here are some statistics"; naming the
              business first makes the same numbers read as "here is the state
              of MY business". Compact on purpose — one row, no hero image —
              so the actual signal stays above the fold. Renders only when the
              profile call succeeded, since it is context and not the point. */}
          {company ? (
            <Pressable
              style={({ pressed }) => [styles.identity, pressed && styles.identityPressed]}
              onPress={() => router.push("/profile")}
              accessibilityRole="button"
              accessibilityLabel={`${company.name} — فتح بيانات الشركة`}
            >
              <View style={styles.identityText}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {company.nameAr?.trim() || company.name}
                </Text>
                <Text style={styles.identityMeta} numberOfLines={1}>
                  {company.categories.find((c) => c.isPrimary)?.label ?? ""}
                  {company.reviewCount > 0
                    ? ` · ${company.rating.toFixed(1)}★ (${company.reviewCount})`
                    : ""}
                </Text>
              </View>
              <Text style={styles.identityChevron}>‹</Text>
            </Pressable>
          ) : null}

          {/* Every tile answers its own number: the total opens the unfiltered
              list, each status opens that list already filtered. The status
              strings are the API's own enum values (ApiLeadStatus), so a tap
              produces a query the server actually supports rather than a
              client-side guess. */}
          <View style={styles.kpiRow}>
            <KpiTile
              label="إجمالي الطلبات"
              value={stats?.total ?? 0}
              deltaPercent={stats?.recent ? deltaPercent(stats.recent.current, stats.recent.previous) : undefined}
              onPress={() => router.push("/(provider)/leads")}
              accessibilityHint="يفتح كل الطلبات"
            />
            <KpiTile
              label="جديد"
              value={stats?.byStatus.New ?? 0}
              onPress={() => router.push("/(provider)/leads?status=New")}
              accessibilityHint="يفتح الطلبات الجديدة"
            />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile
              label="قيد التنفيذ"
              value={stats?.byStatus["In Progress"] ?? 0}
              onPress={() => router.push("/(provider)/leads?status=In%20Progress")}
              accessibilityHint="يفتح الطلبات قيد التنفيذ"
            />
            <KpiTile
              label="مكتمل"
              value={stats?.byStatus.Completed ?? 0}
              onPress={() => router.push("/(provider)/leads?status=Completed")}
              accessibilityHint="يفتح الطلبات المكتملة"
            />
          </View>

          {stats?.perDay ? (
            <LeadsChart perDay={stats.perDay} onPress={() => router.push("/analytics")} />
          ) : null}

          {/* The overview stays calm on purpose (one chart's worth of signal,
              not a dashboard dump) — the depth lives one tap away. */}
          <Pressable
            style={({ pressed }) => [styles.analyticsCta, pressed && styles.analyticsCtaPressed]}
            onPress={() => router.push("/analytics")}
            accessibilityRole="button"
          >
            <Text style={styles.analyticsCtaText}>عرض التحليلات</Text>
            <Text style={styles.analyticsCtaChevron}>‹</Text>
          </Pressable>

          <SectionHeader
            title="أحدث الطلبات"
            actionLabel="عرض الكل"
            onAction={() => router.push("/(provider)/leads")}
          />
          {recentLeads && recentLeads.length > 0 ? (
            <View style={styles.recentList}>
              {recentLeads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onPress={() => router.push(`/lead/${lead.id}`)} />
              ))}
            </View>
          ) : (
            <EmptyCard title="لسه مفيش طلبات" message="أول طلب جديد هيظهر هنا أول ما يوصل." />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** null when the previous window was zero — "no comparable baseline", not
 *  0% or ∞%. Matches ApiLeadStats.recent's own documented semantics. */
function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return ((current - previous) / previous) * 100;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  kpiRow: { flexDirection: rowStart, gap: 12 },
  // Same card treatment as the KPI tiles and the chart below it: a white
  // surface with a hairline border. The overview used to mix a filled grey
  // identity row with bordered white cards underneath, which read as two
  // different card systems stacked on one screen.
  identity: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  identityPressed: { backgroundColor: colors.surfaceContainer },
  identityText: { flex: 1, gap: 2 },
  identityName: {
    fontSize: type.subhead.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  identityMeta: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  identityChevron: { fontSize: type.subhead.fontSize, color: colors.outline },
  analyticsCta: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  analyticsCtaPressed: { opacity: 0.85 },
  analyticsCtaText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onPrimary,
  },
  analyticsCtaChevron: { fontSize: type.title.fontSize, color: colors.onPrimary },
  recentList: { gap: 10 },
});
