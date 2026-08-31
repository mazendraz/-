import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiOffering } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchOfferings, setOfferingVisibility } from "../lib/offerings";
import Button from "../components/Button";
import OfferingRow from "../components/OfferingRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

export default function Offerings() {
  const [offerings, setOfferings] = useState<ApiOffering[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setOfferings(await fetchOfferings());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل قائمة الأسعار. جرّب تاني.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  async function toggleActive(offering: ApiOffering, next: boolean) {
    try {
      const updated = await setOfferingVisibility(offering.id, { isActive: next });
      setOfferings((prev) => prev?.map((o) => (o.id === offering.id ? updated : o)) ?? null);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر تحديث الظهور.");
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "قائمة الأسعار" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.addRow}>
          <Button label="+ إضافة خدمة" onPress={() => router.push("/offering/new")} />
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
                onPress={() => router.push(`/offering/${item.id}`)}
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
  addRow: { padding: 16, paddingBottom: 0 },
  list: { padding: 16 },
  separator: { height: 10 },
});
