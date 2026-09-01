import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchAdminCompanies, type CompanyStatusValue } from "../../lib/adminCompanies";
import Button from "../../components/Button";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 20;

const STATUSES: { value: CompanyStatusValue | undefined; label: string }[] = [
  { value: undefined, label: "الكل" },
  { value: "ACTIVE", label: "نشطة" },
  { value: "INACTIVE", label: "غير نشطة" },
  { value: "SUSPENDED", label: "موقوفة" },
];

function CompanyCard({ company, onPress }: { company: ApiCompany; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text style={styles.name} numberOfLines={1}>{company.name}</Text>
      <Text style={styles.meta}>{company.categoryLabel} · {company.location}</Text>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>★ {company.rating.toFixed(1)} ({company.reviewCount})</Text>
        <Text style={styles.stat}>{company.completedProjects} مشروع مكتمل</Text>
        {company.leadCount != null ? <Text style={styles.stat}>{company.leadCount} طلب</Text> : null}
        {company.busy ? <Text style={styles.busyTag}>مشغول</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Directory (phase 8) plus navigation into the full company editor
 * (phase 10). The status filter narrows results server-side, but a row
 * can't show WHICH status it matched: `ApiCompany` doesn't serialize a
 * `status` field at all, even in the admin payload — see phase-8-admin-
 * core.md's own correction on this; the detail screen reads/sets it via
 * its own dedicated section instead.
 */
export default function AdminCompanies() {
  const [companies, setCompanies] = useState<ApiCompany[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CompanyStatusValue | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean; silent?: boolean }) => {
      if (!opts.silent) setError(null);
      try {
        const result = await fetchAdminCompanies({ page: opts.page, pageSize: PAGE_SIZE, search: search || undefined, status });
        setCompanies((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
        setTotal(result.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل الشركات. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [search, status],
  );

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false, silent: true }));

  function onRefresh() {
    setRefreshing(true);
    void load({ page: 1, append: false, silent: true });
  }

  function onEndReached() {
    if (loadingMore || loading || !companies) return;
    if (companies.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true, silent: true });
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.filterWrap}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="بحث باسم الشركة"
          placeholderTextColor={colors.onSurfaceVariant}
          textAlign={textStart === "right" ? "right" : "left"}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {STATUSES.map((s) => (
            <Pressable
              key={s.label}
              onPress={() => setStatus(s.value)}
              style={[styles.chip, status === s.value && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, status === s.value && styles.chipLabelActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Button label="+ إضافة شركة" variant="secondary" onPress={() => router.push("/company/new")} />
      </View>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
      ) : companies && companies.length > 0 ? (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <CompanyCard company={item} onPress={() => router.push(`/company/${item.id}`)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
        />
      ) : (
        <EmptyCard title="مفيش شركات مطابقة" message="جرّب تغيّر الفلتر أو البحث." />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterWrap: { gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  search: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  chips: { flexDirection: "row-reverse", gap: 8, paddingBottom: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surfaceContainer },
  chipActive: { backgroundColor: colors.primary },
  chipLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  chipLabelActive: { color: colors.onPrimary },
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14, gap: 4 },
  cardPressed: { opacity: 0.7 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  meta: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  statsRow: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap", marginTop: 4 },
  stat: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
  busyTag: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.error },
});
