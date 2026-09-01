import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import type { ApiWaitlistEntry } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { fetchCompanyDetail, fetchCompanyWaitlist } from "../../../lib/adminCompanies";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../../components/ListStates";

const STATUS_LABEL: Record<ApiWaitlistEntry["status"], string> = {
  WAITING: "منتظر",
  NOTIFIED: "اتبلّغ",
  CONVERTED: "اتحوّل لطلب",
  CANCELLED: "ملغي",
};

function EntryRow({ entry }: { entry: ApiWaitlistEntry }) {
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
        <Text style={styles.status}>{STATUS_LABEL[entry.status]}</Text>
      </View>
      <Text style={styles.meta}>{entry.service ?? "—"} · {entry.phone}</Text>
      {entry.note ? <Text style={styles.note} numberOfLines={2}>{entry.note}</Text> : null}
    </View>
  );
}

/** Read-only (phase-10's own scope: "Company waitlist (read)") — the
 *  provider's own waitlist screen (phase 6) is where status changes and
 *  conversion actually happen; this is an admin visibility/audit view. */
export default function CompanyWaitlist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [entries, setEntries] = useState<ApiWaitlistEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [company, page] = await Promise.all([fetchCompanyDetail(id), fetchCompanyWaitlist(id, { pageSize: 100 })]);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCompanyName(company.name);
      setEntries(page.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل قائمة الانتظار. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `قائمة انتظار ${companyName}` }} />
      <SafeAreaView style={styles.container} edges={["top"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : entries && entries.length > 0 ? (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <EntryRow entry={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <EmptyCard title="لسه مفيش حد في قائمة الانتظار" />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  separator: { height: 10 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14, gap: 4 },
  top: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  status: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  note: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
