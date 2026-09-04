import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiLead } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { completeLead, fetchLead } from "../../../lib/leads";
import Button from "../../../components/Button";
import MoneyField from "../../../components/MoneyField";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";
import { formatEgp } from "../../../lib/money";

/**
 * The only path a provider has to "Completed" — see api's PATCH /leads/[id]
 * comment: `requireCompletion` rejects the transition any other way, because
 * this is what captures the final amount and opens the customer's
 * price-verification gate (confirm/dispute). That consequence is real and
 * irreversible from here, which is why submission is behind a confirm that
 * names it explicitly, not a single tap.
 *
 * ── Where the amount comes from ────────────────────────────────────────────
 * NOT a second pricing system. The lead already carries the catalogue's own
 * answer: `estimatedMax` is the total of its priced lines, and
 * `hasOnInspection` says whether any line was "quoted after inspection" and
 * therefore has no number yet. That is exactly the rule the WEBSITE's
 * completion flow uses (app/src/pages/provider/completion/CompleteServicePage
 * — `!lead.hasOnInspection && lead.estimatedMax != null`), and it is reused
 * verbatim here so a provider sees the same figure on both surfaces.
 *
 * Deliberately still EDITABLE when pre-filled. The web's own note explains why:
 * the provider "confirms or adjusts it if the price actually changed" — the
 * catalogue total is what was quoted, not a guarantee of what was charged, and
 * the customer verification gate exists precisely to arbitrate the difference.
 * Locking it would make a legitimate price change impossible to record.
 *
 * ── Additional work vs. pricing ────────────────────────────────────────────
 * Two separate questions, deliberately not merged. "فيه أعمال إضافية؟" decides
 * whether extra-work INFORMATION is collected; fixed-vs-variable decides
 * whether the base amount arrives pre-filled. A fixed-price job can still grow
 * extra work, and a variable job often has none.
 */
export default function CompleteLead() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [lead, setLead] = useState<ApiLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [providerAmount, setProviderAmount] = useState("");
  const [hasAdditionalWork, setHasAdditionalWork] = useState(false);
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const fresh = await fetchLead(id);
      setLead(fresh);
      // Seed the amount from the catalogue when the lead has a real total.
      // Only ever seeds an untouched field, so a re-fetch can never overwrite
      // a number the provider typed.
      const known = !fresh.hasOnInspection && fresh.estimatedMax != null ? fresh.estimatedMax : null;
      if (known != null) setProviderAmount((cur) => (cur === "" ? String(known) : cur));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "تعذّر تحميل الطلب. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const knownAmount =
    lead && !lead.hasOnInspection && lead.estimatedMax != null ? lead.estimatedMax : null;
  const isFixed = knownAmount != null;

  const providerAmountNum = Number(providerAmount) || 0;
  const additionalAmountNum = hasAdditionalWork ? Number(additionalAmount) || 0 : 0;
  const total = providerAmountNum + additionalAmountNum;

  const canSubmit =
    providerAmountNum > 0 &&
    (!hasAdditionalWork || (additionalDescription.trim().length > 0 && additionalAmountNum > 0)) &&
    !busy;

  /**
   * Switching to "لا" CLEARS the extra-work fields rather than just hiding
   * them. Hidden-but-retained state is how a stale description reaches the
   * server after someone changed their mind — the payload below reads these
   * values, so they have to actually be gone, not merely off-screen.
   */
  function setAdditionalWork(next: boolean) {
    setHasAdditionalWork(next);
    if (!next) {
      setAdditionalDescription("");
      setAdditionalAmount("");
      setNotes("");
    }
  }

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
        // Null, not a zeroed object: "no additional work" is the absence of the
        // record, and the server's schema treats it that way.
        additionalWork: hasAdditionalWork
          ? { description: additionalDescription.trim(), amount: additionalAmountNum }
          : null,
        // Notes only travel with additional work — see the section's comment.
        notes: hasAdditionalWork ? notes.trim() || undefined : undefined,
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
        {loading ? (
          <ListSkeleton />
        ) : loadError ? (
          <ErrorCard message={loadError} onRetry={() => void load()} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* ── 1. The amount ──────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>المبلغ النهائي</Text>
              <MoneyField
                label="المبلغ اللي هيدفعه العميل"
                value={providerAmount}
                onChangeValue={setProviderAmount}
                hint={
                  isFixed
                    ? "المبلغ جه من قائمة أسعار الخدمة — عدّله لو الشغل اتغيّر."
                    : "الخدمة دي سعرها بيتحدد بعد المعاينة — اكتب المبلغ النهائي."
                }
              />
              {isFixed ? (
                <View style={styles.sourceRow}>
                  <Text style={styles.sourceLabel}>سعر الخدمة من القائمة</Text>
                  <Text style={styles.sourceValue}>{formatEgp(knownAmount)}</Text>
                </View>
              ) : null}
            </View>

            {/* ── 2. Additional work ─────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <Text style={styles.cardTitle}>فيه أعمال إضافية؟</Text>
                <View style={styles.toggleButtons}>
                  <Pressable
                    style={[styles.toggleBtn, !hasAdditionalWork && styles.toggleBtnActive]}
                    onPress={() => setAdditionalWork(false)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !hasAdditionalWork }}
                  >
                    <Text style={[styles.toggleBtnLabel, !hasAdditionalWork && styles.toggleBtnLabelActive]}>
                      لا
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.toggleBtn, hasAdditionalWork && styles.toggleBtnActive]}
                    onPress={() => setAdditionalWork(true)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: hasAdditionalWork }}
                  >
                    <Text style={[styles.toggleBtnLabel, hasAdditionalWork && styles.toggleBtnLabelActive]}>
                      أيوه
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Everything below only exists when there IS additional work —
                  including the notes field, which describes that work. With
                  "لا" the card is just the question and its answer, with no
                  empty inputs left behind. */}
              {hasAdditionalWork ? (
                <View style={styles.extraFields}>
                  <View>
                    <Text style={styles.label}>وصف الأعمال الإضافية</Text>
                    <TextInput
                      style={styles.textArea}
                      value={additionalDescription}
                      onChangeText={setAdditionalDescription}
                      multiline
                      numberOfLines={3}
                      placeholder="مثلاً: تغيير مواسير إضافية"
                      placeholderTextColor={colors.outline}
                    />
                  </View>
                  <MoneyField
                    label="مبلغ الأعمال الإضافية"
                    value={additionalAmount}
                    onChangeValue={setAdditionalAmount}
                  />
                  <View>
                    <Text style={styles.label}>ملاحظات (اختياري)</Text>
                    <TextInput
                      style={styles.textArea}
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      numberOfLines={3}
                      placeholder="أي تفاصيل إضافية للعميل أو للفريق"
                      placeholderTextColor={colors.outline}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            {/* ── 3. Total ───────────────────────────────────────────────── */}
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>الإجمالي</Text>
              <Text style={styles.summaryValue}>{formatEgp(total)}</Text>
            </View>
            {hasAdditionalWork && additionalAmountNum > 0 ? (
              <Text style={styles.breakdown}>
                {formatEgp(providerAmountNum)} + {formatEgp(additionalAmountNum)} أعمال إضافية
              </Text>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={busy ? "بيترسل..." : "تأكيد وإنهاء الطلب"}
              onPress={confirmAndSubmit}
              busy={busy}
              disabled={!canSubmit}
              style={styles.submit}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 16,
    gap: 14,
  },
  cardTitle: {
    fontSize: type.subhead.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },

  sourceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sourceLabel: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  sourceValue: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },

  toggleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleButtons: { flexDirection: "row-reverse", gap: 8 },
  toggleBtn: {
    minWidth: 64,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainer,
  },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleBtnLabel: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  toggleBtnLabelActive: { color: colors.onPrimary, fontFamily: "Cairo_700Bold" },

  extraFields: { gap: 14 },
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
    minHeight: 90,
    textAlignVertical: "top",
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    textAlign: textStart,
  },

  summary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryContainer,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  summaryLabel: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onPrimaryContainer,
  },
  summaryValue: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onPrimaryContainer,
    fontVariant: ["tabular-nums"],
  },
  breakdown: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
    marginTop: -6,
  },

  error: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.error,
    textAlign: "center",
  },
  submit: { marginTop: 4 },
});
