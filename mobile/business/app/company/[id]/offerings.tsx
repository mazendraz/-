import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchCompanyDetail, fetchCompanyOfferings, setCompanyOfferingVisibility } from "../../../lib/adminCompanies";
import Button from "../../../components/Button";
import OfferingRow from "../../../components/OfferingRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../../components/ListStates";

export default function CompanyOfferings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [offerings, setOfferings] = useState<ApiOffering[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setError(null);
    try {
      const [company, list] = await Promise.all([fetchCompanyDetail(id), fetchCompanyOfferings(id)]);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCompanyName(company.name);
      setOfferings(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل قائمة الأسعار. جرّب تاني.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  async function toggleActive(offering: ApiOffering, next: boolean) {
    if (!id) return;
    try {
      const updated = await setCompanyOfferingVisibility(id, offering.id, { isActive: next });
      setOfferings((prev) => prev?.map((o) => (o.id === offering.id ? updated : o)) ?? null);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر تحديث الظهور.");
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `قائمة أسعار ${companyName}` }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            أي تعديل هنا بيتنشر فورًا — من غير مراجعة، بعكس شاشة مقدّم الخدمة.
          </Text>
        </View>

        <View style={styles.addRow}>
          <Button label="+ إضافة خدمة" onPress={() => router.push(`/company/${id}/offering/new`)} />
        </View>

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : offerings && offerings.length > 0 ? (
          <FlatList
            data={offerings}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <OfferingRow
                offering={item}
                onPress={() => router.push(`/company/${id}/offering/${item.id}`)}
                onToggleActive={(next) => toggleActive(item, next)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        ) : (
          <EmptyCard title="لسه مفيش خدمات مسعّرة" message="ضيف أول خدمة من الزرار فوق." />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notice: { marginHorizontal: 16, marginTop: 12, backgroundColor: colors.secondaryContainer, borderRadius: 10, padding: 10 },
  noticeText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSecondaryContainer, textAlign: "center" },
  addRow: { padding: 16, paddingBottom: 0 },
  list: { padding: 16 },
  separator: { height: 10 },
});
