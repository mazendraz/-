import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { completeLead } from "../../../lib/leads";
import Button from "../../../components/Button";
import MoneyField from "../../../components/MoneyField";
import { formatEgp } from "../../../lib/money";

/**
 * The only path a provider has to "Completed" — see api's PATCH /leads/[id]
 * comment: `requireCompletion` rejects the transition any other way, because
 * this is what captures the final amount and opens the customer's
 * price-verification gate (confirm/dispute). That consequence is real and
 * irreversible from here, which is why submission is behind a confirm that
 * names it explicitly, not a single tap.
 */
export default function CompleteLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [providerAmount, setProviderAmount] = useState("");
  const [hasAdditionalWork, setHasAdditionalWork] = useState(false);
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerAmountNum = Number(providerAmount) || 0;
  const additionalAmountNum = hasAdditionalWork ? Number(additionalAmount) || 0 : 0;
  const total = providerAmountNum + additionalAmountNum;

  const canSubmit =
    providerAmountNum > 0 &&
    (!hasAdditionalWork || (additionalDescription.trim().length > 0 && additionalAmountNum > 0)) &&
    !busy;

  function confirmAndSubmit() {
    if (!canSubmit || !id) return;
    Alert.alert(
      "تأكيد إنهاء الطلب",
      `هيتسجّل المبلغ النهائي ${formatEgp(total)} وهيتبعت للعميل عشان يأكّده. الإجراء ده مينفعش يترجع فيه — متأكد؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد وإنهاء", style: "default", onPress: submit },
      ],
    );
  }

  async function submit() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await completeLead(id, {
        providerAmount: providerAmountNum,
        additionalWork: hasAdditionalWork
          ? { description: additionalDescription.trim(), amount: additionalAmountNum }
          : null,
        notes: notes.trim() || undefined,
      });
      router.replace(`/lead/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إنهاء الطلب. جرّب تاني.");
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "إنهاء الطلب" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <MoneyField label="المبلغ اللي هيدفعه العميل" value={providerAmount} onChangeValue={setProviderAmount} />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>فيه أعمال إضافية؟</Text>
            <View style={styles.toggleButtons}>
              <Pressable
                style={[styles.toggleBtn, !hasAdditionalWork && styles.toggleBtnActive]}
                onPress={() => setHasAdditionalWork(false)}
              >
                <Text style={[styles.toggleBtnLabel, !hasAdditionalWork && styles.toggleBtnLabelActive]}>لا</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, hasAdditionalWork && styles.toggleBtnActive]}
                onPress={() => setHasAdditionalWork(true)}
              >
                <Text style={[styles.toggleBtnLabel, hasAdditionalWork && styles.toggleBtnLabelActive]}>أيوه</Text>
              </Pressable>
            </View>
          </View>

          {hasAdditionalWork ? (
            <>
              <View>
                <Text style={styles.label}>وصف الأعمال الإضافية</Text>
                <TextInput
                  style={styles.textArea}
                  value={additionalDescription}
                  onChangeText={setAdditionalDescription}
                  multiline
                  numberOfLines={3}
                  placeholder="مثلاً: تغيير مواسير إضافية"
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
              <MoneyField label="مبلغ الأعمال الإضافية" value={additionalAmount} onChangeValue={setAdditionalAmount} />
            </>
          ) : null}

          <View>
            <Text style={styles.label}>ملاحظات (اختياري)</Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="أي تفاصيل إضافية للعميل أو للفريق"
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>الإجمالي</Text>
            <Text style={styles.summaryValue}>{formatEgp(total)}</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={busy ? "بيترسل..." : "تأكيد وإنهاء الطلب"}
            onPress={confirmAndSubmit}
            busy={busy}
            disabled={!canSubmit}
          />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  label: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    marginBottom: 6,
    textAlign: textStart,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlignVertical: "top",
    minHeight: 80,
    textAlign: textStart,
  },
  toggleRow: { gap: 8 },
  toggleLabel: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  toggleButtons: { flexDirection: "row-reverse", gap: 10 },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleBtnLabel: { fontFamily: "Cairo_600SemiBold", fontSize: type.body.fontSize, color: colors.onSurface },
  toggleBtnLabelActive: { color: colors.onPrimary },
  summary: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    padding: 16,
  },
  summaryLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  summaryValue: { fontSize: type.title.fontSize, fontFamily: "Alexandria_800ExtraBold", color: colors.primary },
  error: { fontSize: type.body.fontSize, fontFamily: "Cairo_500Medium", color: colors.error, textAlign: "center" },
});
