import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import type { ApiReview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchCompanyDetail, addCompanyReview, deleteCompanyReview } from "../../../lib/adminCompanies";
import { setReviewApproved } from "../../../lib/approvals";
import Button from "../../../components/Button";
import RatingStars from "../../../components/RatingStars";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../../components/ListStates";

/**
 * `ApiReview` never exposes an `approved` flag (see phase-9's own note —
 * neither the public nor the admin serializer puts it on the wire), so a
 * row here can't show whether it's already approved. "موافقة" is always
 * offered anyway — it's idempotent, so tapping it on an already-approved
 * review is harmless.
 */
export default function CompanyReviews() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [reviews, setReviews] = useState<ApiReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState("5");
  const [text, setText] = useState("");
  const [district, setDistrict] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setError(null);
    try {
      const company = await fetchCompanyDetail(id);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCompanyName(company.name);
      setReviews(company.reviews);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل التقييمات. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  const canSubmit = author.trim().length > 0 && text.trim().length > 0 && district.trim().length > 0 && !submitting;

  async function handleAdd() {
    if (!canSubmit || !id) return;
    setSubmitting(true);
    try {
      const created = await addCompanyReview(id, { author: author.trim(), rating: Number(rating) || 5, text: text.trim(), date, district: district.trim() });
      setReviews((prev) => [created, ...(prev ?? [])]);
      setAuthor("");
      setText("");
      setDistrict("");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إضافة التقييم.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(review: ApiReview) {
    if (!review.id) return;
    try {
      await setReviewApproved(review.id, true);
      Alert.alert("تم", "التقييم اتوافق عليه.");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الموافقة.");
    }
  }

  function handleDelete(review: ApiReview) {
    if (!review.id || !id) return;
    Alert.alert("حذف التقييم", `هل تريد حذف تقييم "${review.author}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCompanyReview(id, review.id!);
            setReviews((prev) => prev?.filter((r) => r.id !== review.id) ?? null);
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `تقييمات ${companyName}` }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.form}>
              <Text style={styles.formTitle}>إضافة تقييم (منسّق يدويًا)</Text>
              <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="اسم العميل" placeholderTextColor={colors.onSurfaceVariant} />
              <TextInput style={styles.input} value={district} onChangeText={setDistrict} placeholder="الحي" placeholderTextColor={colors.onSurfaceVariant} />
              <TextInput style={styles.input} value={rating} onChangeText={(v) => setRating(v.replace(/[^0-9]/g, ""))} placeholder="التقييم (1-5)" placeholderTextColor={colors.onSurfaceVariant} keyboardType="number-pad" />
              <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="التاريخ (نص، مثلاً: مارس 2026)" placeholderTextColor={colors.onSurfaceVariant} />
              <TextInput style={[styles.input, styles.textArea]} value={text} onChangeText={setText} placeholder="نص التقييم" placeholderTextColor={colors.onSurfaceVariant} multiline />
              <Button label={submitting ? "بيتضاف..." : "إضافة"} onPress={handleAdd} busy={submitting} disabled={!canSubmit} />
            </View>

            {reviews && reviews.length > 0 ? (
              <View style={styles.list}>
                {reviews.map((r, i) => (
                  <View key={r.id ?? i} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.author}>{r.author}</Text>
                      <RatingStars rating={r.rating} />
                    </View>
                    <Text style={styles.meta}>{r.district} · {r.date}{r.verified ? " · عميل موثّق" : ""}</Text>
                    <Text style={styles.text}>{r.text}</Text>
                    {r.id ? (
                      <View style={styles.actions}>
                        <Pressable style={styles.approveBtn} onPress={() => handleApprove(r)}>
                          <Text style={styles.approveText}>موافقة</Text>
                        </Pressable>
                        <Pressable style={styles.deleteBtn} onPress={() => handleDelete(r)}>
                          <Text style={styles.deleteText}>حذف</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyCard title="لسه مفيش تقييمات" />
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16 },
  form: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 16, gap: 10 },
  formTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlign: textStart,
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  list: { gap: 10 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14, gap: 6 },
  cardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  author: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  text: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, lineHeight: 20 },
  actions: { flexDirection: "row-reverse", gap: 8, marginTop: 4 },
  approveBtn: { backgroundColor: colors.primaryContainer, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  approveText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimaryContainer },
  deleteBtn: { backgroundColor: colors.errorContainer, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  deleteText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onErrorContainer },
});
