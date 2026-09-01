import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ApiError } from "@alassema/mobile-shared";
import {
  fetchAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  categoryToInput,
  type CategoryInput,
} from "../../lib/adminCategories";
import Button from "../../components/Button";
import CategoryForm from "../../components/CategoryForm";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

const BLANK: CategoryInput = {
  label: "",
  description: "",
  icon: "",
  isActive: true,
  pricingMode: "QUOTE_ONLY",
};

export default function CategoryEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [value, setValue] = useState<CategoryInput>(BLANK);
  const [publishedCount, setPublishedCount] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    setError(null);
    try {
      const all = await fetchAdminCategories();
      const found = all.find((c) => c.id === id);
      if (!found) throw new ApiError(404, "التصنيف مش لاقيه.");
      setValue(categoryToInput(found));
      setPublishedCount(found.publishedOfferingCompanyCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل التصنيف. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSave = value.label.trim().length >= 2 && value.description.trim().length > 0 && value.icon.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving || !id) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await createCategory(value);
        router.replace(`/category/${created.id}`);
      } else {
        await updateCategory(id, value);
        Alert.alert("تم الحفظ", "اتحفظ التصنيف.");
      }
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!id || isNew) return;
    Alert.alert("حذف التصنيف", `هل تريد حذف "${value.label}"؟ لو فيه شركات التصنيف ده هو الوحيد بتاعها، الحذف هيترفض.`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteCategory(id);
            router.back();
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: isNew ? "تصنيف جديد" : "تعديل التصنيف" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <CategoryForm value={value} onChange={setValue} publishedOfferingCompanyCount={publishedCount} />
            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} disabled={!canSave} />
            {!isNew ? <Button label="حذف التصنيف" variant="danger" onPress={handleDelete} busy={deleting} /> : null}
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
