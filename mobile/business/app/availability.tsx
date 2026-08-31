import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchProfile } from "../lib/profile";
import { setAvailability, fetchBusyWindows, createBusyWindow, deleteBusyWindow, type ApiBusyWindow } from "../lib/availability";
import Button from "../components/Button";
import AvailabilityToggle from "../components/AvailabilityToggle";
import BusyWindowRow from "../components/BusyWindowRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Availability() {
  const [busy, setBusy] = useState(false);
  const [busyUntil, setBusyUntil] = useState<number | null>(null);
  const [windows, setWindows] = useState<ApiBusyWindow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For scheduling a new window — day offsets, not a calendar (see
  // docs/architecture/business-app/phase-6-provider-operations.md's own note
  // on this simplification for mobile v1).
  const [startInDays, setStartInDays] = useState("1");
  const [durationDays, setDurationDays] = useState("3");
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

  async function handleSchedule() {
    const start = Number(startInDays);
    const duration = Number(durationDays);
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 1) return;

    setScheduling(true);
    try {
      const startsAt = Date.now() + start * DAY_MS;
      const endsAt = startsAt + duration * DAY_MS;
      const created = await createBusyWindow({ startsAt, endsAt });
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
          <ScrollView contentContainerStyle={styles.content}>
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

            <View style={styles.scheduleForm}>
              <Text style={styles.formTitle}>جدولة فترة جديدة</Text>
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>تبدأ بعد (يوم)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={startInDays}
                    onChangeText={(v) => setStartInDays(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>تستمر (يوم)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={durationDays}
                    onChangeText={(v) => setDurationDays(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Button label="جدولة" onPress={handleSchedule} busy={scheduling} />
            </View>
          </ScrollView>
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
  scheduleForm: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  formTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  formRow: { flexDirection: "row-reverse", gap: 10 },
  formField: { flex: 1 },
  formLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, marginBottom: 4 },
  formInput: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    backgroundColor: colors.surface,
  },
});
