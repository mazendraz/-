import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiLead } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Button from "./Button";
import Icon from "./Icon";
import ReviewModal from "./ReviewModal";
import { verifyLeadAmount } from "../lib/leads";
import { formatEgp } from "../lib/pricing";
import { ApiError, useSettings, rowStart } from "@alassema/mobile-shared";

type Phase = "amount" | "discrepancy" | "confirmed" | "rating";

/**
 * Mandatory, non-dismissible "verify the final amount" screen — the mobile
 * counterpart of the website's PriceVerificationGate (see
 * app/src/components/priceVerification/). A customer with a PENDING
 * completion sees ONLY this, on every screen, until they resolve it — see
 * app/_layout.tsx, which renders this in place of the whole Stack, the same
 * way RootLayout.tsx replaces the whole public site on the web.
 *
 * No back/close/skip control exists on the amount or discrepancy phases —
 * that is deliberate, matching the website's own comment on this exact
 * point. Only the rating phase (after verification is already resolved) can
 * be skipped, via the existing ReviewModal's onClose.
 */
export default function PriceVerificationGate({
  lead,
  onResolved,
}: {
  lead: ApiLead;
  /** Called once the (optional) rating phase is done or skipped — app/_layout.tsx
   *  uses this to stop latching onto this lead and resume normal routing. */
  onResolved: () => void;
}) {
  // Guaranteed present: the caller only ever mounts this for a lead whose
  // completion.verificationStatus is PENDING.
  const completion = lead.completion!;
  const settings = useSettings();
  const supportEmail = settings.support_email?.trim();
  const [phase, setPhase] = useState<Phase>("amount");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      await verifyLeadAmount({ leadId: lead.id, decision: "confirmed" });
      setPhase("confirmed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تسجيل التأكيد. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscrepancy(clientAmount: number, note: string) {
    setBusy(true);
    setError("");
    try {
      await verifyLeadAmount({
        leadId: lead.id,
        decision: "discrepancy",
        clientAmount,
        note: note || undefined,
      });
      setPhase("confirmed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تسجيل البلاغ. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "rating") {
    return (
      <ReviewModal
        visible
        leadId={lead.id}
        companyName={lead.companyName}
        onClose={onResolved}
        onSubmitted={onResolved}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {phase === "amount" && (
          <>
            <Text style={styles.title}>أكّد السعر النهائي</Text>
            <Text style={styles.sub}>الشركة سجّلت طلبك كمكتمل بالمبلغ ده. أكّده أو بلّغ عن فرق.</Text>

            <OrderContextGrid lead={lead} />
            <ProviderAmountCard
              completion={completion}
              busy={busy}
              error={error}
              onConfirm={handleConfirm}
              onDispute={() => setPhase("discrepancy")}
            />
          </>
        )}

        {phase === "discrepancy" && (
          <DiscrepancyForm
            completion={completion}
            busy={busy}
            error={error}
            onSubmit={handleDiscrepancy}
            onBack={() => setPhase("amount")}
          />
        )}

        {phase === "confirmed" && (
          <ConfirmationState lead={lead} completion={completion} onContinue={() => setPhase("rating")} />
        )}

        {/* Escape hatch — deliberately absent from "confirmed"/"rating": this
            gate has no back/close/skip by design (see the module comment),
            but that must never mean a customer who genuinely can't resolve
            it (a server error, a dispute they can't phrase in one field) is
            trapped with zero way out. Linking.openURL, not router.push: this
            component renders in PLACE of the whole Stack (see app/_layout.tsx)
            — there is no navigator mounted underneath it to receive an
            in-app push, same reason MaintenanceScreen's own contact link
            uses mailto: instead of a route. */}
        {supportEmail && (phase === "amount" || phase === "discrepancy") && (
          <Pressable onPress={() => Linking.openURL(`mailto:${supportEmail}`)} hitSlop={8} style={styles.helpLink}>
            <Text style={styles.helpLinkText}>محتاج مساعدة؟ تواصل معانا</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderContextGrid({ lead }: { lead: ApiLead }) {
  const fields: [string, string][] = [
    ["الخدمة", lead.service],
    ["الشركة", lead.companyName],
    ["رقم الطلب", lead.refNumber],
    ["تاريخ الاكتمال", lead.completion ? new Date(lead.completion.submittedAt).toLocaleDateString("ar-EG") : "—"],
  ];
  return (
    <View style={styles.grid}>
      {fields.map(([label, value]) => (
        <View key={label} style={styles.gridCell}>
          <Text style={styles.gridLabel}>{label}</Text>
          <Text style={styles.gridValue} numberOfLines={1}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function ProviderAmountCard({
  completion,
  busy,
  error,
  onConfirm,
  onDispute,
}: {
  completion: NonNullable<ApiLead["completion"]>;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  const hasExtra = completion.additionalWorkAmount != null && completion.additionalWorkAmount > 0;
  return (
    <View style={styles.card}>
      <Text style={styles.amountLabel}>المبلغ المُرسَل من الشركة</Text>
      <Text style={styles.amountValue}>{formatEgp(completion.finalTotal)}</Text>

      {hasExtra && (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownText}>
            الأساسي {formatEgp(completion.providerAmount)} · شغل إضافي {formatEgp(completion.additionalWorkAmount ?? 0)}
          </Text>
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.question}>المبلغ ده مطابق للمتفق عليه؟</Text>
      {error !== "" && <Text style={styles.error}>{error}</Text>}

      <Button label="✓ آه، مطابق" onPress={onConfirm} busy={busy} disabled={busy} />
      <Button label="لأ، فيه فرق" variant="secondary" onPress={onDispute} disabled={busy} style={styles.secondBtn} />

      <Text style={styles.footerNote}>تأكيدك بيقفل الطلب نهائيًا. لو فيه فرق، بلّغنا وهيتراجع.</Text>
    </View>
  );
}

function DiscrepancyForm({
  completion,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  completion: NonNullable<ApiLead["completion"]>;
  busy: boolean;
  error: string;
  onSubmit: (clientAmount: number, note: string) => void;
  onBack: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState("");

  function handleSubmit() {
    const n = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(n) || n < 0) {
      setAmountError("اكتب مبلغ صحيح");
      return;
    }
    setAmountError("");
    onSubmit(Math.round(n), note.trim());
  }

  return (
    <View style={styles.card}>
      <Text style={styles.discTitle}>بلّغ عن فرق في المبلغ</Text>
      <Text style={styles.sub}>اكتب المبلغ اللي إنت متفق عليه فعليًا مع الشركة.</Text>

      <View style={styles.reportedRow}>
        <Text style={styles.reportedLabel}>المبلغ المُرسَل</Text>
        <Text style={styles.reportedValue}>{formatEgp(completion.finalTotal)}</Text>
      </View>

      <Text style={styles.fieldLabel}>المبلغ الصح من وجهة نظرك</Text>
      <View style={styles.amountRow}>
        <Text style={styles.currencySign}>ج</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.outline}
          style={styles.amountInput}
        />
      </View>
      {amountError !== "" && <Text style={styles.error}>{amountError}</Text>}

      <Text style={styles.fieldLabel}>ملاحظة (اختياري)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        style={styles.textArea}
        textAlign="right"
        placeholder="أي تفاصيل تساعدنا نفهم الفرق"
        placeholderTextColor={colors.outline}
      />

      {error !== "" && <Text style={styles.error}>{error}</Text>}

      <Button label="ابعت البلاغ" onPress={handleSubmit} busy={busy} disabled={busy} />
      <Button label="رجوع" variant="secondary" onPress={onBack} disabled={busy} style={styles.secondBtn} />
    </View>
  );
}

function ConfirmationState({
  lead,
  completion,
  onContinue,
}: {
  lead: ApiLead;
  completion: NonNullable<ApiLead["completion"]>;
  onContinue: () => void;
}) {
  const amount = completion.clientAmount ?? completion.finalTotal;
  const isDiscrepancy = completion.verificationStatus === "DISCREPANCY";
  return (
    <View style={styles.card}>
      <View style={[styles.doneIcon, isDiscrepancy && styles.doneIconAmber]}>
        <Icon name="check_circle" size={28} color={isDiscrepancy ? colors.primary : colors.success} />
      </View>
      <Text style={styles.doneTitle}>{isDiscrepancy ? "اتسجّل البلاغ" : "اتأكّد المبلغ"}</Text>
      <Text style={styles.sub}>
        {isDiscrepancy ? "سجّلنا بلاغك بمبلغ " : "أكّدنا المبلغ "}
        <Text style={styles.doneAmount}>{formatEgp(amount)}</Text>.
      </Text>
      <View style={styles.doneMeta}>
        <Text style={styles.doneMetaText}>{lead.refNumber} · {lead.service}</Text>
      </View>
      <Button label="كمّل" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: 20, gap: 12, flexGrow: 1, justifyContent: "center" },
  helpLink: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 8, marginTop: 4 },
  helpLinkText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.outline,
    textDecorationLine: "underline",
  },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_800ExtraBold",
    color: colors.onSurface,
    textAlign: "center",
  },
  sub: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 16,
    marginBottom: 12,
  },
  gridCell: { width: "50%", paddingVertical: 6, gap: 2 },
  gridLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  gridValue: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 20,
    gap: 10,
  },
  amountLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "center" },
  amountValue: {
    fontFamily: "Alexandria_800ExtraBold",
    fontSize: type.headline.fontSize,
    color: colors.onSurface,
    textAlign: "center",
  },
  breakdown: { alignSelf: "center", backgroundColor: colors.primaryContainer, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  breakdownText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.primary },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10 },
  question: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "center", marginBottom: 4 },
  error: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.error, textAlign: "center" },
  secondBtn: { marginTop: 2 },
  footerNote: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "center", marginTop: 6 },
  discTitle: { fontFamily: "Alexandria_700Bold", fontSize: type.title.fontSize, color: colors.onSurface, textAlign: "right" },
  reportedRow: {
    flexDirection: rowStart,
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reportedLabel: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline },
  reportedValue: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.onSurface },
  fieldLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  amountRow: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currencySign: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },
  amountInput: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: type.title.fontSize, color: colors.onSurface, textAlign: "right" },
  textArea: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
  },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successContainer,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  doneIconAmber: { backgroundColor: colors.primaryContainer },
  doneTitle: { fontFamily: "Alexandria_700Bold", fontSize: type.title.fontSize, color: colors.onSurface, textAlign: "center" },
  doneAmount: { fontFamily: "Cairo_700Bold", color: colors.onSurface },
  doneMeta: {
    alignSelf: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 6,
  },
  doneMetaText: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.outline },
});
