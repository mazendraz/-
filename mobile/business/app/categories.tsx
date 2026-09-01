import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import type { ApiAdminCategory } from "@alassema/core";
import { fetchAdminCategories } from "../lib/adminCategories";
import Button from "../components/Button";
import CategoryRow from "../components/CategoryRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

export default function Categories() {
  const [categories, setCategories] = useState<ApiAdminCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setCategories(await fetchAdminCategories());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل التصنيفات. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "التصنيفات" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.addRow}>
          <Button label="+ تصنيف جديد" onPress={() => router.push("/category/new")} />
        </View>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : categories && categories.length > 0 ? (
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <CategoryRow category={item} onPress={() => router.push(`/category/${item.id}`)} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <EmptyCard title="لسه مفيش تصنيفات" />
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
