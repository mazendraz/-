import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiBundleRule } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchBundleRules, createBundleRule } from "../lib/bundleRules";
import Button from "../components/Button";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

function BundleRuleCard({ rule }: { rule: ApiBundleRule }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardLabel}>{rule.label ?? `${rule.minItems}+ خدمات`}</Text>
        <View style={[styles.chip, rule.isPublished ? styles.chipLive : styles.chipDraft]}>
          <Text style={[styles.chipLabel, rule.isPublished ? styles.chipLabelLive : styles.chipLabelDraft]}>
            {rule.isPublished ? "شغّالة" : "مسودة"}
          </Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>
        من {rule.minItems} خدمات في نفس الطلب → خصم {rule.discountPercent}%
      </Text>
      {!rule.isActive ? <Text style={styles.cardInactive}>متوقفة حاليًا</Text> : null}
    </View>
  );
}

export default function BundleRules() {
  const [rules, setRules] = useState<ApiBundleRule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [minItems, setMinItems] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setRules(await fetchBundleRules());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل قواعد الباقات. جرّب تاني.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  const canCreate = minItems.length > 0 && Number(minItems) >= 2 && discountPercent.length > 0;

  async function handleCreate() {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const created = await createBundleRule({
        label: label.trim() || null,
        minItems: Number(minItems),
        discountPercent: Number(discountPercent),
      });
      setRules((prev) => [...(prev ?? []), created]);
      setLabel("");
      setMinItems("");
      setDiscountPercent("");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إضافة القاعدة.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "خصومات الباقات" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : (
          <FlatList
            data={rules ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.form}>
                <Text style={styles.formTitle}>قاعدة جديدة</Text>
                <Text style={styles.hint}>لما العميل يطلب أكتر من خدمة مع بعض في نفس الطلب، بيتطبّق خصم تلقائي.</Text>
                <TextInput
                  style={styles.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="اسم القاعدة (اختياري)"
                  placeholderTextColor={colors.onSurfaceVariant}
                />
                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <Text style={styles.label}>عدد الخدمات (2 على الأقل)</Text>
                    <TextInput
                      style={styles.input}
                      value={minItems}
                      onChangeText={(v) => setMinItems(v.replace(/[^0-9]/g, ""))}
                      placeholder="مثلاً: 3"
                      placeholderTextColor={colors.onSurfaceVariant}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.label}>نسبة الخصم %</Text>
                    <TextInput
                      style={styles.input}
                      value={discountPercent}
                      onChangeText={(v) => setDiscountPercent(v.replace(/[^0-9]/g, ""))}
                      placeholder="مثلاً: 10"
                      placeholderTextColor={colors.onSurfaceVariant}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <Button label={creating ? "بتتضاف..." : "إضافة قاعدة"} onPress={handleCreate} busy={creating} disabled={!canCreate} />
                <Text style={styles.listTitle}>القواعد الحالية</Text>
              </View>
            }
            renderItem={({ item }) => <BundleRuleCard rule={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<EmptyCard title="لسه مفيش قواعد باقات" message="ضيف أول قاعدة من الفورم فوق." />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  form: { gap: 10, marginBottom: 8 },
  formTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  hint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, lineHeight: 18 },
  formRow: { flexDirection: "row-reverse", gap: 10 },
  formField: { flex: 1, gap: 4 },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, textAlign: textStart },
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
  listTitle: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, marginTop: 14, textAlign: textStart },
  separator: { height: 10 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14, gap: 4 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  cardMeta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  cardInactive: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.error, textAlign: textStart },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  chipLive: { backgroundColor: colors.successContainer },
  chipDraft: { backgroundColor: colors.secondaryContainer },
  chipLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold" },
  chipLabelLive: { color: colors.onSuccessContainer },
  chipLabelDraft: { color: colors.onSecondaryContainer },
});
