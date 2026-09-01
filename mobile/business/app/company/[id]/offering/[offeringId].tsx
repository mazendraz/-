import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiOffering, ApiPriceUnit, ApiPricingModel } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import {
  fetchCompanyOfferings,
  createCompanyOffering,
  updateCompanyOffering,
  deleteCompanyOffering,
  fetchOfferingReference,
} from "../../../../lib/adminCompanies";
import type { OfferingInput } from "../../../../lib/offerings";
import Button from "../../../../components/Button";
import PriceFields from "../../../../components/PriceFields";
import TierRow from "../../../../components/TierRow";
import { ListSkeleton, ErrorCard } from "../../../../components/ListStates";

export default function AdminOfferingEditor() {
  const { id, offeringId } = useLocalSearchParams<{ id: string; offeringId: string }>();
  const isNew = offeringId === "new";

  const [offering, setOffering] = useState<ApiOffering | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingModel, setPricingModel] = useState<ApiPricingModel>("FIXED");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [unit, setUnit] = useState<ApiPriceUnit | null>(null);

  const [reference, setReference] = useState<{ available: boolean; median?: number; unit?: string; sampleSize?: number } | null>(null);

  const load = useCallback(async () => {
    if (isNew || !id || !offeringId) return;
    setError(null);
    try {
      const all = await fetchCompanyOfferings(id);
      const found = all.find((o) => o.id === offeringId);
      if (!found) throw new ApiError(404, "الخدمة مش لاقيها.");
      setOffering(found);
      setName(found.name);
      setDescription(found.description ?? "");
      setPricingModel(found.pricingModel);
      setPriceMin(found.priceMin != null ? String(found.priceMin) : "");
      setPriceMax(found.priceMax != null ? String(found.priceMax) : "");
      setUnit(found.unit);
      if (found.pricingModel === "PER_UNIT") {
        fetchOfferingReference(found.id)
          .then((res) => setReference({ available: res.reference.available, median: res.reference.median, unit: res.reference.unit, sampleSize: res.reference.sampleSize }))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الخدمة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id, offeringId, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildInput(): OfferingInput {
    return {
      name: name.trim(),
      description: description.trim() || null,
      pricingModel,
      priceMin: pricingModel === "ON_INSPECTION" ? null : priceMin ? Number(priceMin) : null,
      priceMax: pricingModel === "FIXED" || pricingModel === "ON_INSPECTION" ? null : priceMax ? Number(priceMax) : null,
      unit: pricingModel === "PER_UNIT" ? unit : null,
    };
  }

  const canSave =
    name.trim().length > 0 &&
    (pricingModel === "ON_INSPECTION" ||
      (priceMin.length > 0 && (pricingModel !== "PER_UNIT" || unit != null) && (pricingModel !== "RANGE" || priceMax.length > 0)));

  async function handleSave() {
    if (!canSave || saving || !id) return;
    setSaving(true);
    try {
      const input = buildInput();
      if (isNew) {
        const created = await createCompanyOffering(id, input);
        router.replace(`/company/${id}/offering/${created.id}`);
      } else if (offering) {
        const updated = await updateCompanyOffering(id, offering.id, input);
        setOffering(updated);
        Alert.alert("تم الحفظ", "الخدمة اتحدّثت — التعديل ده ظاهر للعملاء فورًا.");
      }
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!id || !offering) return;
    Alert.alert("حذف الخدمة", `هل تريد حذف "${offering.name}" نهائيًا؟ هتختفي من الموقع فورًا.`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCompanyOffering(id, offering.id);
            router.back();
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: isNew ? "خدمة جديدة" : "تعديل الخدمة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.notice}>
              <Text style={styles.noticeText}>الحفظ هنا مباشر — من غير مراجعة أدمن.</Text>
            </View>

            <View>
              <Text style={styles.label}>اسم الخدمة</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.onSurfaceVariant} />
            </View>

            <View>
              <Text style={styles.label}>وصف (اختياري)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                multiline
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>

            <PriceFields
              pricingModel={pricingModel}
              onPricingModelChange={setPricingModel}
              priceMin={priceMin}
              priceMax={priceMax}
              unit={unit}
              onPriceMinChange={setPriceMin}
              onPriceMaxChange={setPriceMax}
              onUnitChange={setUnit}
            />

            {reference?.available ? (
              <View style={styles.referenceCard}>
                <Text style={styles.referenceText}>
                  سعر مرجعي (استرشادي فقط): متوسط {reference.median} ج / {reference.unit} — على عيّنة {reference.sampleSize} خدمة مشابهة.
                </Text>
              </View>
            ) : null}

            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} disabled={!canSave} />

            {offering ? (
              <>
                {offering.tiers.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>فئات الأسعار (من مقدّم الخدمة — للعرض فقط)</Text>
                    <View style={styles.tiersList}>
                      {offering.tiers.map((t) => (
                        <TierRow key={t.id} tier={t} />
                      ))}
                    </View>
                  </>
                ) : null}

                <Button label="حذف الخدمة" variant="danger" onPress={handleDelete} style={styles.deleteBtn} />
              </>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  notice: { backgroundColor: colors.secondaryContainer, borderRadius: 10, padding: 10 },
  noticeText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSecondaryContainer, textAlign: "center" },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, marginBottom: 6, textAlign: textStart },
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
  referenceCard: { backgroundColor: colors.surfaceContainer, borderRadius: 10, padding: 10 },
  referenceText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginTop: 8 },
  tiersList: { gap: 8 },
  deleteBtn: { marginTop: 16 },
});
