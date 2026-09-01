import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { setReviewApproved, deleteReview, fetchPendingReviews, type AdminReviewItem } from "../../../lib/approvals";
import { reviewQueue } from "../../../lib/approvalsStore";
import ApproveRejectBar from "../../../components/ApproveRejectBar";
import RatingStars from "../../../components/RatingStars";
import WaitingFor from "../../../components/WaitingFor";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

/** No single-review GET route — same list-is-the-only-read pattern as the
 *  project detail screen. */
export default function ReviewDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [review, setReview] = useState<AdminReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const page = await fetchPendingReviews({ pageSize: 100 });
      const found = page.data.find((r) => r.id === id);
      if (!found) throw new ApiError(404, "التقييم مش لاقيه — يمكن اتراجع بالفعل.");
      setReview(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل التقييم. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove() {
    if (!review || busy) return;
    setBusy(true);
    try {
      await setReviewApproved(review.id, true);
      reviewQueue.removeItem(review.id);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الموافقة. جرّب تاني.");
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!review) return;
    Alert.alert("حذف التقييم", "هل تريد حذف هذا التقييم نهائيًا؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteReview(review.id);
            reviewQueue.removeItem(review.id);
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
      <Stack.Screen options={{ headerShown: true, title: "تقييم عميل" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : error && !review ? (
          <ErrorCard message={error} onRetry={load} />
        ) : review ? (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.header}>
                <Text style={styles.author}>{review.author}</Text>
                {review.createdAt ? <WaitingFor createdAt={review.createdAt} /> : null}
              </View>
              <RatingStars rating={review.rating} />
              <Text style={styles.company}>{review.companyName}</Text>
              <Text style={styles.meta}>{review.district} · {review.date} · {review.verified ? "عميل موثّق" : "غير موثّق"}</Text>
              <Text style={styles.text}>{review.text}</Text>
              {error ? <ErrorCard message={error} /> : null}
            </ScrollView>

            <View style={styles.actionsBar}>
              <ApproveRejectBar busy={busy} rejectLabel="حذف" onApprove={handleApprove} onReject={handleDelete} />
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
  author: { flex: 1, fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  text: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, lineHeight: 22 },
  actionsBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface },
});
