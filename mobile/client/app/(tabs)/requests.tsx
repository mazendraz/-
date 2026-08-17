import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiLead, ApiLeadStatus, ApiWaitlistEntry } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import StatusPill from "../../components/StatusPill";
import WaitlistStatusPill from "../../components/WaitlistStatusPill";
import { router } from "expo-router";
import { fetchAccountLeads } from "../../lib/customerLeads";
import { fetchMyWaitlistEntries } from "../../lib/waitlist";
import { useLiveEvents } from "../../lib/liveEvents";
import ReviewModal from "../../components/ReviewModal";
import { ApiError } from "../../lib/api";

type RequestItem =
  | { kind: "lead"; id: string; createdAt: number; data: ApiLead }
  | { kind: "waitlist"; id: string; createdAt: number; data: ApiWaitlistEntry };

type Filter = ApiLeadStatus | "All" | "Waitlist";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "All", label: "الكل" },
  { key: "New", label: "استلمنا الطلب" },
  { key: "Contacted", label: "بنتواصل معاك" },
  { key: "In Progress", label: "شغل جاري" },
  { key: "Completed", label: "خلص" },
  { key: "Cancelled", label: "اتلغى" },
  { key: "Waitlist", label: "قوائم الانتظار" },
];

/**
 * "My Requests" — real leads AND waitlist joins, merged into one list newest
 * first, mirroring the website's MyRequests.tsx (which combines useMyLeads +
 * useMyWaitlistEntries the same way). A waitlist join never had a
 * district/budget/chat/review — it only lets a customer see it exists and
 * its current status, same as the website's smaller WaitlistRequestCard.
 */
export default function Requests() {
  const [leads, setLeads] = useState<ApiLead[] | null>(null);
  const [waitlist, setWaitlist] = useState<ApiWaitlistEntry[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [reviewing, setReviewing] = useState<{ id: string; companyName: string } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const [l, w] = await Promise.all([fetchAccountLeads(), fetchMyWaitlistEntries()]);
      setLeads(l);
      setWaitlist(w);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "تعذّر تحميل طلباتك. اسحب لتحديث الصفحة.",
      );
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents(() => load());

  const items: RequestItem[] = useMemo(() => {
    const all: RequestItem[] = [
      ...(leads ?? []).map((data) => ({ kind: "lead" as const, id: data.id, createdAt: data.createdAt, data })),
      ...(waitlist ?? []).map((data) => ({ kind: "waitlist" as const, id: data.id, createdAt: data.createdAt, data })),
    ].sort((a, b) => b.createdAt - a.createdAt);

    if (filter === "All") return all;
    if (filter === "Waitlist") return all.filter((i) => i.kind === "waitlist");
    return all.filter((i) => i.kind === "lead" && i.data.status === filter);
  }, [leads, waitlist, filter]);

  const loaded = leads !== null && waitlist !== null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>طلباتي</Text>

      {loaded && (leads!.length > 0 || waitlist!.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !loaded ? null : (
            <View style={styles.empty}>
              <Icon name="receipt_long" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش طلبات لسه</Text>
              <Text style={styles.emptyBody}>أول طلب تبعته هيظهر هنا.</Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === "lead" ? (
            <LeadCard lead={item.data} onReview={setReviewing} />
          ) : (
            <WaitlistCard entry={item.data} />
          )
        }
      />

      {error !== "" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {reviewing && (
        <ReviewModal
          visible
          leadId={reviewing.id}
          companyName={reviewing.companyName}
          onClose={() => setReviewing(null)}
          onSubmitted={() => {
            setReviewing(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function LeadCard({ lead: item, onReview }: { lead: ApiLead; onReview: (v: { id: string; companyName: string }) => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.company} numberOfLines={1}>{item.companyName}</Text>
        <StatusPill status={item.status} />
      </View>
      <Text style={styles.service} numberOfLines={1}>{item.service}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.ref}>{item.refNumber}</Text>
        <Text style={styles.district}>{item.district}</Text>
      </View>
      <View style={styles.cardActions}>
        <Pressable
          style={styles.actionBtn}
          onPress={() =>
            router.push({
              pathname: "/chat/[leadId]",
              params: { leadId: item.id, companyName: item.companyName },
            })
          }
        >
          <Icon name="forum" size={16} color={colors.primary} />
          <Text style={styles.actionText}>المحادثة</Text>
        </Pressable>
        {item.status === "Completed" && !item.reviewed && (
          <Pressable
            style={styles.actionBtn}
            onPress={() => onReview({ id: item.id, companyName: item.companyName })}
          >
            <Icon name="favorite" size={16} color={colors.primary} />
            <Text style={styles.actionText}>قيّم الخدمة</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function WaitlistCard({ entry }: { entry: ApiWaitlistEntry }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.company} numberOfLines={1}>{entry.companyName}</Text>
        <WaitlistStatusPill status={entry.status} />
      </View>
      <View style={styles.waitlistBadge}>
        <Icon name="hourglass_top" size={14} color="#92400e" />
        <Text style={styles.waitlistBadgeText}>قائمة انتظار</Text>
      </View>
      {entry.service ? <Text style={styles.service} numberOfLines={1}>{entry.service}</Text> : null}
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
      <Pressable
        style={styles.viewCompanyBtn}
        onPress={() => router.push({ pathname: "/company/[slug]", params: { slug: entry.companySlug } })}
      >
        <Text style={styles.actionText}>عرض الشركة</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "right",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterRow: { flexGrow: 0, marginTop: 8 },
  filterContent: { flexDirection: "row-reverse", paddingHorizontal: 20, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  filterChipTextActive: { color: colors.onPrimary },
  listContent: { padding: 20, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, flexShrink: 1, textAlign: "right" },
  service: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right" },
  note: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right", backgroundColor: colors.surfaceContainer, borderRadius: 8, padding: 8 },
  waitlistBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-end" },
  waitlistBadgeText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: "#92400e" },
  cardFooter: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 4 },
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  actionBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  viewCompanyBtn: { alignSelf: "flex-end", marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant, width: "100%", alignItems: "center" },
  actionText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.primary },
  ref: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.outline, writingDirection: "ltr" },
  district: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  empty: { alignItems: "center", gap: 6, paddingTop: 80 },
  emptyTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  emptyBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
});
