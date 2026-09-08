import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchProfile } from "../lib/profile";
import { setAvailability, fetchBusyWindows, createBusyWindow, deleteBusyWindow, type ApiBusyWindow } from "../lib/availability";
import AvailabilityToggle from "../components/AvailabilityToggle";
import BusyWindowRow from "../components/BusyWindowRow";
import BusyWindowScheduler, { type ScheduleInput } from "../components/BusyWindowScheduler";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";
import FormScroll from "../components/FormScroll";

export default function Availability() {
  const [busy, setBusy] = useState(false);
  const [busyUntil, setBusyUntil] = useState<number | null>(null);
  const [windows, setWindows] = useState<ApiBusyWindow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [profile, busyWindows] = await Promise.all([fetchProfile(), fetchBusyWindows()]);
      setBusy(profile.company.busy);
      setBusyUntil(profile.company.busyUntil ?? null);
      setWindows(busyWindows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات التوفر. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  async function handleToggle(nextBusy: boolean) {
    setToggling(true);
    try {
      await setAvailability({ busy: nextBusy, busyUntil: nextBusy ? busyUntil : null });
      setBusy(nextBusy);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر تحديث حالة التوفر.");
    } finally {
      setToggling(false);
    }
  }

  async function handleSchedule(input: ScheduleInput) {
    setScheduling(true);
    try {
      const created = await createBusyWindow(input);
      setWindows((prev) => [...(prev ?? []), created]);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر جدولة الفترة.");
    } finally {
      setScheduling(false);
    }
  }

  function handleDeleteWindow(window: ApiBusyWindow) {
    Alert.alert("حذف الفترة", "هل تريد حذف فترة الانشغال دي؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteBusyWindow(window.id);
            setWindows((prev) => prev?.filter((w) => w.id !== window.id) ?? null);
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "التوفر" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : (
          <FormScroll contentContainerStyle={styles.content}>
            <AvailabilityToggle busy={busy} busyUntil={busyUntil} onToggle={handleToggle} disabled={toggling} />

            <Text style={styles.sectionTitle}>فترات انشغال مجدولة</Text>
            <Text style={styles.sectionHint}>هتتقفل وتتفتح تلقائيًا في المواعيد دي — من غير ما تحتاج تعمل حاجة.</Text>

            {windows && windows.length > 0 ? (
              <View style={styles.windowsList}>
                {windows.map((w) => (
                  <BusyWindowRow key={w.id} window={w} onDelete={() => handleDeleteWindow(w)} />
                ))}
              </View>
            ) : (
              <EmptyCard title="مفيش فترات مجدولة" />
            )}

            <BusyWindowScheduler onSchedule={handleSchedule} busy={scheduling} />
          </FormScroll>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14 },
  sectionTitle: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    marginTop: 8,
  },
  sectionHint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
  },
  windowsList: { gap: 8 },
});
