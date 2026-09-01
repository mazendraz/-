import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiLead, ApiLeadStatus, ApiWaitlistEntry } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import StatusPill from "../../components/StatusPill";
import WaitlistStatusPill from "../../components/WaitlistStatusPill";
import { router } from "expo-router";
import { fetchAccountLeads } from "../../lib/customerLeads";
import { fetchMyWaitlistEntries } from "../../lib/waitlist";
import { useLiveEvents, ApiError, rowStart } from "@alassema/mobile-shared";
import ReviewModal from "../../components/ReviewModal";
import { useRequireAccount } from "../../lib/authGate";
import { formatLeadEstimate } from "../../lib/pricing";

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
 * "My Requests" — sent requests AND queued ones, merged into one list newest
 * first, mirroring the website's MyRequests.tsx (which combines useMyLeads +
 * useMyWaitlistEntries the same way).
 *
 * A queued request is one sent to a company that was booked out. It carries the
 * same content as a sent one — same form — but has no reference number, chat or
 * review until the provider accepts it, at which point it becomes an ordinary
 * request and appears in this list as one. Same split as the website's
 * WaitlistRequestCard.
 */
export default function Requests() {
  const customer = useRequireAccount("/requests");
  const [leads, setLeads] = useState<ApiLead[] | null>(null);
  const [waitlist, setWaitlist] = useState<ApiWaitlistEntry[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Has a load ATTEMPT finished, whatever its outcome? Distinct from "we have
  // data" — see the note in load()'s finally.
  const [settled, setSettled] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  // Missing entirely before — the website's MyRequests.tsx has a search box
  // above its status filters (SearchInput), this screen only had the filters.
  const [query, setQuery] = useState("");
  const [reviewing, setReviewing] = useState<{ id: string; companyName: string } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    // Guest mid-redirect (see useRequireAccount) — these are account-scoped
    // endpoints, nothing to fetch without a session.
    if (!customer) return;
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
      // `loaded` used to be DERIVED — `leads !== null && waitlist !== null` —
      // and the catch above sets neither, so a single failed load left it false
      // for good. That is what produced the half-built screen: no search box, no
      // filter chips, and a ListEmptyComponent that renders null when not
      // loaded, i.e. a blank list with a thin error stripe at the bottom and no
      // visible way to retry. Settling it here, in `finally`, means the screen
      // always reaches a state it can render an error (and a Retry) for.
      setSettled(true);
      if (isRefresh) setRefreshing(false);
    }
  }, [customer]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents(() => load());

  // Fallback for the live stream reconnecting (liveEvents.ts retries on its
  // own, but that can take up to its 30s backoff ceiling) or having silently
  // never delivered an event this session. Slow enough to be a safety net,
  // not a substitute for the stream — see that module's comment on why
  // polling here is only ever REDUNDANT with a healthy connection, never the
  // primary path.
  useEffect(() => {
    const id = setInterval(() => load(), 45_000);
    return () => clearInterval(id);
  }, [load]);

  const items: RequestItem[] = useMemo(() => {
    const all: RequestItem[] = [
      ...(leads ?? []).map((data) => ({ kind: "lead" as const, id: data.id, createdAt: data.createdAt, data })),
      ...(waitlist ?? []).map((data) => ({ kind: "waitlist" as const, id: data.id, createdAt: data.createdAt, data })),
    ].sort((a, b) => b.createdAt - a.createdAt);

    const byFilter =
      filter === "All" ? all
      : filter === "Waitlist" ? all.filter((i) => i.kind === "waitlist")
      : all.filter((i) => i.kind === "lead" && i.data.status === filter);

    // Same searchable fields as the website's MyRequests.tsx.
    const q = query.trim().toLowerCase();
    if (!q) return byFilter;
    return byFilter.filter((i) => {
      const searchable = i.kind === "lead"
        ? [i.data.refNumber, i.data.companyName, i.data.service, i.data.district]
        : [i.data.companyName, i.data.service ?? "", i.data.note ?? ""];
      return searchable.some((v) => v.toLowerCase().includes(q));
    });
  }, [leads, waitlist, filter, query]);

  const hasData = leads !== null && waitlist !== null;
  const failed = settled && !hasData && error !== "";
  // Controls the search box and filter chips: only meaningful once there is
  // actually something to search and filter.
  const loaded = hasData;

  if (!customer) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarStart}>
          <Logo size={28} />
          <Text style={styles.title}>طلباتي</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="بحث" onPress={() => router.push("/search")} hitSlop={8}>
          <Icon name="search" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {loaded && (leads!.length > 0 || waitlist!.length > 0) && (
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.outline} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="دوّر في طلباتك"
            placeholderTextColor={colors.outline}
            style={styles.searchInput}
            textAlign="right"
          />
        </View>
      )}

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
          failed ? (
            // A real, recoverable error state. Before this the branch was
            // `!loaded ? null`, so a failed load rendered NOTHING here — a blank
            // list with a thin stripe at the bottom, and pull-to-refresh as the
            // only (undiscoverable) way back.
            <View style={styles.empty}>
              <Icon name="cloud_off" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>تعذّر تحميل طلباتك</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => load(true)}
                disabled={refreshing}
                style={[styles.retryBtn, refreshing && styles.retryBtnDisabled]}
              >
                <Text style={styles.retryText}>{refreshing ? "بنحاول..." : "حاول تاني"}</Text>
              </Pressable>
            </View>
          ) : !loaded ? null : (leads!.length === 0 && waitlist!.length === 0) ? (
            <View style={styles.empty}>
              <Icon name="receipt_long" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش طلبات لسه</Text>
              <Text style={styles.emptyBody}>أول طلب تبعته هيظهر هنا.</Text>
            </View>
          ) : (
            // Requests exist but the current filter/search matched none —
            // distinct copy from "no requests at all" (website's
            // requests_none_match), not the same empty state repeated.
            <View style={styles.empty}>
              <Icon name="search" size={40} color={colors.outline} />
              <Text style={styles.emptyBody}>مفيش طلبات مطابقة.</Text>
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

      {/* Only for a failed refresh OVER existing rows. A total failure gets the
          full error state in ListEmptyComponent instead, which has a Retry —
          showing both would be the same message twice. */}
      {error !== "" && hasData && (
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
      {(item.items?.length ?? 0) > 0 && (
        <View style={styles.estimateRow}>
          <Text style={styles.estimateLabel}>الإجمالي التقديري</Text>
          <Text style={styles.estimateValue}>{formatLeadEstimate(item)}</Text>
        </View>
      )}
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

/**
 * A queued request — one sent to a company that was booked out.
 *
 * Shows the same content as LeadCard (services, estimate, district) because it
 * is the same request form; what it does not have YET is a reference number, a
 * chat thread or a review, all of which are created the moment the provider
 * accepts it. So the actions LeadCard offers are replaced by a line saying where
 * this stands in the queue.
 */
function WaitlistCard({ entry }: { entry: ApiWaitlistEntry }) {
  const converted = entry.status === "CONVERTED";
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
      {entry.items.length > 0 && (
        <View style={styles.estimateRow}>
          <Text style={styles.estimateLabel}>الإجمالي التقديري</Text>
          <Text style={styles.estimateValue}>{formatLeadEstimate(entry)}</Text>
        </View>
      )}
      {/* Absent on joins made through the short form this replaced — those
          genuinely never collected a district. */}
      {entry.district ? (
        <View style={styles.cardFooter}>
          <Text style={styles.district}>{entry.district}</Text>
        </View>
      ) : null}
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
      {/* CONVERTED means the provider accepted it and a real request now exists
          — a card of its own further up this same list, so point at it rather
          than repeat it. */}
      <Text style={[styles.queueNote, converted && styles.queueNoteDone]}>
        {converted
          ? "اتقبل — بقى طلب عادي، هتلاقيه فوق في القائمة"
          : "مستني دوره — هيتحوّل لطلب عادي برقم مرجعي أول ما الشركة تقبله"}
      </Text>
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
  topBar: {
    flexDirection: rowStart,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topBarStart: { flexDirection: rowStart, alignItems: "center", gap: 8 },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "right",
  },
  searchRow: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  filterRow: { flexGrow: 0, marginTop: 8 },
  filterContent: { flexDirection: rowStart, paddingHorizontal: 20, gap: 8 },
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
  cardHeader: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", gap: 8 },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, flexShrink: 1, textAlign: "right" },
  service: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right" },
  estimateRow: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", marginTop: 6, backgroundColor: colors.surfaceContainer, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  estimateLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.outline },
  estimateValue: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary },
  note: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right", backgroundColor: colors.surfaceContainer, borderRadius: 8, padding: 8 },
  queueNote: { fontFamily: "Cairo_500Medium", fontSize: type.caption.fontSize, color: "#92400e", textAlign: "right", lineHeight: 20 },
  queueNoteDone: { color: colors.onSuccessContainer },
  waitlistBadge: { flexDirection: rowStart, alignItems: "center", gap: 4, alignSelf: "flex-end" },
  waitlistBadgeText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: "#92400e" },
  cardFooter: { flexDirection: rowStart, justifyContent: "space-between", marginTop: 4 },
  cardActions: { flexDirection: rowStart, gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  actionBtn: { flexDirection: rowStart, alignItems: "center", gap: 4 },
  viewCompanyBtn: { alignSelf: "flex-end", marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant, width: "100%", alignItems: "center" },
  actionText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.primary },
  ref: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.outline, writingDirection: "ltr" },
  district: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  empty: { alignItems: "center", gap: 6, paddingTop: 80, paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnDisabled: { opacity: 0.6 },
  retryText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onPrimary,
  },
  emptyTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  emptyBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "center" },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
});
