import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiWaitlistEntry } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchWaitlist, removeWaitlistEntry, setWaitlistStatus } from "../lib/waitlist";
import WaitlistRow from "../components/WaitlistRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

export default function Waitlist() {
  const [entries, setEntries] = useState<ApiWaitlistEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const result = await fetchWaitlist({ pageSize: 100 });
      setEntries(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل قائمة الانتظار. جرّب تاني.");
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

  async function notify(entry: ApiWaitlistEntry) {
    try {
      const updated = await setWaitlistStatus(entry.id, "NOTIFIED");
      setEntries((prev) => prev?.map((e) => (e.id === entry.id ? updated : e)) ?? null);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إرسال الإشعار.");
    }
  }

  function convert(entry: ApiWaitlistEntry) {
    // CONVERTED creates a REAL Lead server-side (waitlist.service.convertToLead)
    // — worth a confirm, unlike the other status moves.
    Alert.alert(
      "قبول الطلب من قائمة الانتظار",
      `هيتحوّل طلب "${entry.name}" لطلب فعلي في قائمة الطلبات. تكمل؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "قبول",
          onPress: async () => {
            try {
              const updated = await setWaitlistStatus(entry.id, "CONVERTED");
              setEntries((prev) => prev?.map((e) => (e.id === entry.id ? updated : e)) ?? null);
            } catch (err) {
              Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر قبول الطلب.");
            }
          },
        },
      ],
    );
  }

  function remove(entry: ApiWaitlistEntry) {
    Alert.alert("حذف من القائمة", `هل تريد حذف "${entry.name}" من قائمة الانتظار؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await removeWaitlistEntry(entry.id);
            setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "قائمة الانتظار" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : entries && entries.length > 0 ? (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <WaitlistRow
                entry={item}
                onNotify={() => notify(item)}
                onConvert={() => convert(item)}
                onRemove={() => remove(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        ) : (
          <EmptyCard title="مفيش حد في قائمة الانتظار" message="هيظهر هنا أي عميل ينضم للقائمة وقت ما تكون مشغول." />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  separator: { height: 10 },
});
