import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiOffering, ApiPriceUnit, ApiPricingModel } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import {
  fetchOfferings,
  createOffering,
  updateOffering,
  deleteOffering,
  requestPublish,
  addTier,
  removeTier,
  type OfferingInput,
} from "../../lib/offerings";
import Button from "../../components/Button";
import PriceFields from "../../components/PriceFields";
import TierRow from "../../components/TierRow";
import PublishStateChip from "../../components/PublishStateChip";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function OfferingEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

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

  const [tierLabel, setTierLabel] = useState("");
  const [tierPrice, setTierPrice] = useState("");
  const [tierQtyMin, setTierQtyMin] = useState("");
  const [tierQtyMax, setTierQtyMax] = useState("");
  const [addingTier, setAddingTier] = useState(false);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    setError(null);
    try {
      // No single-offering GET on the provider side — the list is the only
      // read, so find this one in it. Acceptable: a provider's own catalog
      // is small (dozens, not thousands).
      const all = await fetchOfferings();
      const found = all.find((o) => o.id === id);
      if (!found) throw new ApiError(404, "Offering not found");
      setOffering(found);
      setName(found.name);
      setDescription(found.description ?? "");
      setPricingModel(found.pricingModel);
      setPriceMin(found.priceMin != null ? String(found.priceMin) : "");
      setPriceMax(found.priceMax != null ? String(found.priceMax) : "");
      setUnit(found.unit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الخدمة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

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
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const input = buildInput();
      if (isNew) {
        const created = await createOffering(input);
        router.replace(`/offering/${created.id}`);
      } else if (offering) {
        const result = await updateOffering(offering.id, input);
        if (result.path === "direct" && result.offering) {
          setOffering(result.offering);
        } else {
          Alert.alert("اتبعت للمراجعة", "التعديل ده على خدمة منشورة، فبعتناه للأدمن يراجعه الأول.");
          router.back();
        }
      }
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!offering) return;
    Alert.alert("حذف الخدمة", `هل تريد حذف "${offering.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteOffering(offering.id);
            if (result.path === "review") {
              Alert.alert("اتبعت للمراجعة", "الخدمة منشورة، فطلب الحذف هيتراجع الأول قبل ما يتنفذ.");
            }
            router.back();
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
          }
        },
      },
    ]);
  }

  function handlePublish() {
    if (!offering) return;
    Alert.alert(
      "نشر الخدمة",
      "هيتبعت طلب نشر للأدمن. من اللحظة دي مش هتقدر تعدّل الخدمة لحد ما يراجعها.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "نشر",
          onPress: async () => {
            try {
              await requestPublish(offering.id);
              Alert.alert("تم الإرسال", "طلب النشر بعتناه للأدمن.");
              router.back();
            } catch (err) {
              Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إرسال طلب النشر.");
            }
          },
        },
      ],
    );
  }

  async function handleAddTier() {
    if (!offering || !tierLabel.trim() || !tierPrice) return;
    setAddingTier(true);
    try {
      const result = await addTier(offering.id, {
        label: tierLabel.trim(),
        priceMin: Number(tierPrice),
        qtyMin: tierQtyMin ? Number(tierQtyMin) : null,
        qtyMax: tierQtyMax ? Number(tierQtyMax) : null,
      });
      setOffering(result.offering);
      if (result.path === "review") {
        Alert.alert("اتبعت للمراجعة", "الفئة دي سعر جديد على خدمة منشورة، فبعتناها للأدمن يراجعها.");
      }
      setTierLabel("");
      setTierPrice("");
      setTierQtyMin("");
      setTierQtyMax("");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إضافة الفئة.");
    } finally {
      setAddingTier(false);
    }
  }

  async function handleDeleteTier(tierId: string) {
    if (!offering) return;
    try {
      const result = await removeTier(offering.id, tierId);
      setOffering(result.offering);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر حذف الفئة.");
    }
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
            {offering ? <PublishStateChip offering={offering} /> : null}

            <View>
              <Text style={styles.label}>اسم الخدمة</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="مثلاً: دهانات داخلية" placeholderTextColor={colors.onSurfaceVariant} />
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

            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} disabled={!canSave} />

            {offering && !offering.isPublished ? (
              <Button label="نشر الخدمة" variant="secondary" onPress={handlePublish} />
            ) : null}

            {offering ? (
              <>
                <Text style={styles.sectionTitle}>فئات الأسعار (حسب الكمية)</Text>
                {offering.tiers.length > 0 ? (
                  <View style={styles.tiersList}>
                    {offering.tiers.map((t) => (
                      <TierRow key={t.id} tier={t} onDelete={() => handleDeleteTier(t.id)} />
                    ))}
                  </View>
                ) : null}

                <View style={styles.tierForm}>
                  <TextInput style={styles.input} value={tierLabel} onChangeText={setTierLabel} placeholder="اسم الفئة (مثلاً: 2-3 غرف)" placeholderTextColor={colors.onSurfaceVariant} />
                  <View style={styles.tierRow}>
                    <TextInput style={[styles.input, styles.tierField]} value={tierQtyMin} onChangeText={(v) => setTierQtyMin(v.replace(/[^0-9]/g, ""))} placeholder="من" placeholderTextColor={colors.onSurfaceVariant} keyboardType="number-pad" />
                    <TextInput style={[styles.input, styles.tierField]} value={tierQtyMax} onChangeText={(v) => setTierQtyMax(v.replace(/[^0-9]/g, ""))} placeholder="لحد" placeholderTextColor={colors.onSurfaceVariant} keyboardType="number-pad" />
                    <TextInput style={[styles.input, styles.tierField]} value={tierPrice} onChangeText={(v) => setTierPrice(v.replace(/[^0-9]/g, ""))} placeholder="السعر" placeholderTextColor={colors.onSurfaceVariant} keyboardType="number-pad" />
                  </View>
                  <Button label="إضافة فئة" variant="secondary" onPress={handleAddTier} busy={addingTier} disabled={!tierLabel.trim() || !tierPrice} />
                </View>

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
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginTop: 8 },
  tiersList: { gap: 8 },
  tierForm: { backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12, gap: 8 },
  tierRow: { flexDirection: "row-reverse", gap: 8 },
  tierField: { flex: 1 },
  deleteBtn: { marginTop: 16 },
});
