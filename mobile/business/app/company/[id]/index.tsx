import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiAdminCategory } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import {
  fetchCompanyDetail,
  updateCompany,
  deleteCompany,
  companyToInput,
  type CompanyInput,
} from "../../../lib/adminCompanies";
import { fetchAdminCategories } from "../../../lib/adminCategories";
import Button from "../../../components/Button";
import CompanyForm from "../../../components/CompanyForm";
import CompanySectionNav from "../../../components/CompanySectionNav";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

export default function CompanyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [categories, setCategories] = useState<ApiAdminCategory[]>([]);
  const [value, setValue] = useState<CompanyInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [company, cats] = await Promise.all([fetchCompanyDetail(id), fetchAdminCategories()]);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCategories(cats);
      setCompanyName(company.name);
      const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
      setValue(companyToInput(company, idBySlug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات الشركة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!id || !value || saving) return;
    if (value.categoryIds.length === 0) {
      Alert.alert("خطأ", "لازم تصنيف واحد على الأقل.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCompany(id, value);
      setCompanyName(updated.name);
      Alert.alert("تم الحفظ", "اتحفظت بيانات الشركة.");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!id) return;
    Alert.alert(
      "حذف الشركة",
      `هل تريد حذف "${companyName}" نهائيًا؟ هيتحذف معاها كل مشاريعها وتقييماتها وطلباتها. لا يمكن التراجع.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteCompany(id);
              router.back();
            } catch (err) {
              Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: companyName || "الشركة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : value && id ? (
          <ScrollView contentContainerStyle={styles.content}>
            <CompanySectionNav
              sections={[
                { label: "الحالة", onPress: () => router.push(`/company/${id}/status`) },
                { label: "التوفر", onPress: () => router.push(`/company/${id}/availability`) },
                { label: "قائمة الأسعار", onPress: () => router.push(`/company/${id}/offerings`) },
                { label: "معرض الأعمال", onPress: () => router.push(`/company/${id}/projects`) },
                { label: "التقييمات", onPress: () => router.push(`/company/${id}/reviews`) },
                { label: "قائمة الانتظار", onPress: () => router.push(`/company/${id}/waitlist`) },
              ]}
            />

            <Text style={styles.sectionTitle}>البيانات</Text>
            <CompanyForm value={value} onChange={setValue} categories={categories} />

            <Button label={saving ? "بيتحفظ..." : "حفظ التعديلات"} onPress={handleSave} busy={saving} />
            <Button label="حذف الشركة" variant="danger" onPress={handleDelete} busy={deleting} style={styles.deleteBtn} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  deleteBtn: { marginTop: 8 },
});
