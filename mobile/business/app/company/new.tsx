import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiAdminCategory } from "@alassema/core";
import { ApiError } from "@alassema/mobile-shared";
import { createCompany, type CompanyInput } from "../../lib/adminCompanies";
import { fetchAdminCategories } from "../../lib/adminCategories";
import Button from "../../components/Button";
import CompanyForm from "../../components/CompanyForm";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

const BLANK: CompanyInput = {
  categoryIds: [],
  name: "",
  nameAr: null,
  tagline: "",
  about: "",
  logo: "",
  cover: "",
  services: [],
  gallery: [],
  badges: [],
  phone: "",
  location: "",
  yearsExperience: 0,
  responseTime: "",
  verifiedSince: new Date().getFullYear().toString(),
  featured: true,
  verified: false,
  email: null,
  whatsapp: null,
};

export default function NewCompany() {
  const [categories, setCategories] = useState<ApiAdminCategory[]>([]);
  const [value, setValue] = useState<CompanyInput>(BLANK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdminCategories()
      .then(setCategories)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل التصنيفات."))
      .finally(() => setLoading(false));
  }, []);

  const canSave =
    value.name.trim().length >= 2 &&
    value.tagline.trim().length > 0 &&
    value.about.trim().length > 0 &&
    value.logo.trim().length > 0 &&
    value.cover.trim().length > 0 &&
    value.phone.trim().length >= 8 &&
    value.location.trim().length > 0 &&
    value.responseTime.trim().length > 0 &&
    value.verifiedSince.trim().length > 0 &&
    value.categoryIds.length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const created = await createCompany(value);
      router.replace(`/company/${created.id}`);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إنشاء الشركة. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "شركة جديدة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorCard message={error} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <CompanyForm value={value} onChange={setValue} categories={categories} />
            <Button label={saving ? "بينشئ..." : "إنشاء الشركة"} onPress={handleSave} busy={saving} disabled={!canSave} />
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
});
