import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiSiteReview } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { setSiteReviewVisible, deleteSiteReview, fetchPendingSiteReviews } from "../../../lib/approvals";
import { siteReviewQueue } from "../../../lib/approvalsStore";
import ApproveRejectBar from "../../../components/ApproveRejectBar";
import RatingStars from "../../../components/RatingStars";
import WaitingFor from "../../../components/WaitingFor";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

/** No single-site-review GET route — same list-is-the-only-read pattern. */
export default function SiteReviewDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [review, setReview] = useState<ApiSiteReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const page = await fetchPendingSiteReviews({ pageSize: 100 });
      const found = page.data.find((r) => r.id === id);
      if (!found) throw new ApiError(404, "الرأي مش لاقيه — يمكن اتراجع بالفعل.");
      setReview(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الرأي. جرّب تاني.");
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
      await setSiteReviewVisible(review.id, true);
      siteReviewQueue.removeItem(review.id);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الإظهار. جرّب تاني.");
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!review) return;
    Alert.alert("حذف الرأي", "هل تريد حذف الرأي ده نهائيًا؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteSiteReview(review.id);
            siteReviewQueue.removeItem(review.id);
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
      <Stack.Screen options={{ headerShown: true, title: "رأي عميل" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : error && !review ? (
          <ErrorCard message={error} onRetry={load} />
        ) : review ? (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.header}>
                <Text style={styles.author}>{review.name}</Text>
                <WaitingFor createdAt={review.createdAt} />
              </View>
              <RatingStars rating={review.rating} />
              <Text style={styles.meta}>{review.district}</Text>
              <Text style={styles.text}>{review.text}</Text>
              {error ? <ErrorCard message={error} /> : null}
            </ScrollView>

            <View style={styles.actionsBar}>
              <ApproveRejectBar busy={busy} approveLabel="إظهار" rejectLabel="حذف" onApprove={handleApprove} onReject={handleDelete} />
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
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  text: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, lineHeight: 22 },
  actionsBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface },
});
