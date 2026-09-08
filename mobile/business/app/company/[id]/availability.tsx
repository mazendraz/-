import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import {
  fetchCompanyDetail,
  setCompanyAvailability,
  fetchCompanyBusyWindows,
  createCompanyBusyWindow,
  deleteCompanyBusyWindow,
} from "../../../lib/adminCompanies";
import type { ApiBusyWindow } from "../../../lib/availability";
import AvailabilityToggle from "../../../components/AvailabilityToggle";
import BusyWindowRow from "../../../components/BusyWindowRow";
import BusyWindowScheduler, { type ScheduleInput } from "../../../components/BusyWindowScheduler";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../../components/ListStates";
import FormScroll from "../../../components/FormScroll";

export default function CompanyAvailability() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyUntil, setBusyUntil] = useState<number | null>(null);
  const [windows, setWindows] = useState<ApiBusyWindow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setError(null);
    try {
      const [company, busyWindows] = await Promise.all([fetchCompanyDetail(id), fetchCompanyBusyWindows(id)]);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCompanyName(company.name);
      setBusy(company.busy);
      setBusyUntil(company.busyUntil ?? null);
      setWindows(busyWindows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات التوفر. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  async function handleToggle(nextBusy: boolean) {
    if (!id) return;
    setToggling(true);
    try {
      const updated = await setCompanyAvailability(id, { busy: nextBusy, busyUntil: nextBusy ? busyUntil : null });
      setBusy(updated.busy);
      setBusyUntil(updated.busyUntil ?? null);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر تحديث حالة التوفر.");
    } finally {
      setToggling(false);
    }
  }

  async function handleSchedule(input: ScheduleInput) {
    if (!id) return;
    setScheduling(true);
    try {
      const created = await createCompanyBusyWindow(id, input);
      setWindows((prev) => [...(prev ?? []), created]);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر جدولة الفترة.");
    } finally {
      setScheduling(false);
    }
  }

  function handleDeleteWindow(window: ApiBusyWindow) {
    if (!id) return;
    Alert.alert("حذف الفترة", "هل تريد حذف فترة الانشغال دي؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCompanyBusyWindow(id, window.id);
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
      <Stack.Screen options={{ headerShown: true, title: `توفر ${companyName}` }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : (
          <FormScroll contentContainerStyle={styles.content}>
            <AvailabilityToggle busy={busy} busyUntil={busyUntil} onToggle={handleToggle} disabled={toggling} />

            <Text style={styles.sectionTitle}>فترات انشغال مجدولة</Text>
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
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginTop: 8 },
  windowsList: { gap: 8 },
});
