import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiFeedback } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { setFeedbackRead, deleteFeedback, fetchPendingFeedback, FEEDBACK_TYPE_LABEL } from "../../../lib/approvals";
import { feedbackQueue } from "../../../lib/approvalsStore";
import Button from "../../../components/Button";
import WaitingFor from "../../../components/WaitingFor";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

/** No single-feedback GET route — same list-is-the-only-read pattern. */
export default function FeedbackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ApiFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const page = await fetchPendingFeedback({ pageSize: 100 });
      const found = page.data.find((f) => f.id === id);
      if (!found) throw new ApiError(404, "الرسالة مش لاقيها — يمكن اتقرت بالفعل.");
      setItem(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الرسالة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleMarkRead() {
    if (!item || busy) return;
    setBusy(true);
    try {
      await setFeedbackRead(item.id, true);
      feedbackQueue.removeItem(item.id);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر التحديث. جرّب تاني.");
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!item) return;
    Alert.alert("حذف الرسالة", "هل تريد حذف الرسالة دي نهائيًا؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteFeedback(item.id);
            feedbackQueue.removeItem(item.id);
            router.back();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "تعذّر الحذف. جرّب تاني.");
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "رسالة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : error && !item ? (
          <ErrorCard message={error} onRetry={load} />
        ) : item ? (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.header}>
                <Text style={styles.type}>{FEEDBACK_TYPE_LABEL[item.type]}</Text>
                <WaitingFor createdAt={item.createdAt} />
              </View>
              <Text style={styles.company}>{item.companyName}</Text>
              <Text style={styles.message}>{item.message}</Text>

              {item.name || item.phone ? (
                <View style={styles.contactCard}>
                  {item.name ? <Text style={styles.contactRow}>الاسم: {item.name}</Text> : null}
                  {item.phone ? (
                    <Text style={styles.contactRow} onPress={() => Linking.openURL(`tel:${item.phone}`).catch(() => {})}>
                      الهاتف: {item.phone}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {error ? <ErrorCard message={error} /> : null}
            </ScrollView>

            <View style={styles.actionsBar}>
              <View style={styles.actionsRow}>
                <Button label="حذف" variant="danger" busy={busy} onPress={handleDelete} style={styles.deleteBtn} />
                <Button label={item.isRead ? "متقرية" : "علّمها متقرية"} busy={busy} disabled={item.isRead} onPress={handleMarkRead} style={styles.readBtn} />
              </View>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  type: { flex: 1, fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  message: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, lineHeight: 22 },
  contactCard: { backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12, gap: 6 },
  contactRow: { fontSize: type.body.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurface, textAlign: textStart },
  actionsBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface },
  actionsRow: { flexDirection: "row-reverse", gap: 10 },
  deleteBtn: { flex: 1 },
  readBtn: { flex: 1 },
});
