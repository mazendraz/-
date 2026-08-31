import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiLead, ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useLiveEvents } from "@alassema/mobile-shared";
import { fetchLead, updateLeadStatus } from "../../lib/leads";
import { isAdmin } from "../../lib/permissions";
import { useStaffAuth } from "../../lib/staffAuth";
import StatusPill from "../../components/StatusPill";
import StatusSheet from "../../components/StatusSheet";
import ItemsTable from "../../components/ItemsTable";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";
import { formatEgp } from "../../lib/money";

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useStaffAuth();
  const admin = isAdmin(user);
  const [lead, setLead] = useState<ApiLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setLead(await fetchLead(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الطلب. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Catches a status change (an admin acting on the same lead, or this
  // provider's own other device) landing WHILE this screen is already open —
  // scoped to THIS lead's id so an unrelated lead's event doesn't cause a
  // pointless refetch.
  useLiveEvents((event) => {
    if (event.type === "lead-status" && event.leadId === id) {
      void load();
    }
  });

  async function handleStatusSelect(status: ApiLeadStatus) {
    if (!lead) return;
    setSheetVisible(false);
    setStatusBusy(true);
    try {
      setLead(await updateLeadStatus(lead.id, status));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحديث الحالة. جرّب تاني.");
    } finally {
      setStatusBusy(false);
    }
  }

  function call() {
    if (lead) Linking.openURL(`tel:${lead.phone}`).catch(() => {});
  }

  function whatsapp() {
    if (lead) Linking.openURL(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`).catch(() => {});
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "تفاصيل الطلب" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error && !lead ? (
          <ErrorCard message={error} onRetry={load} />
        ) : lead ? (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.service}>{lead.service}</Text>
              <StatusPill status={lead.status} />
            </View>
            <Text style={styles.ref}>{lead.refNumber}</Text>

            <Section title="العميل">
              <InfoRow label="الاسم" value={lead.name} />
              <InfoRow label="الحي" value={lead.district} />
              <InfoRow label="الهاتف" value={lead.phone} />
              <View style={styles.contactRow}>
                <Pressable style={styles.contactBtn} onPress={call}>
                  <Text style={styles.contactBtnLabel}>اتصال</Text>
                </Pressable>
                <Pressable style={styles.contactBtn} onPress={whatsapp}>
                  <Text style={styles.contactBtnLabel}>واتساب</Text>
                </Pressable>
              </View>
            </Section>

            {lead.description ? (
              <Section title="تفاصيل الطلب">
                <Text style={styles.description}>{lead.description}</Text>
              </Section>
            ) : null}

            {lead.items && lead.items.length > 0 ? (
              <Section title="البنود">
                <ItemsTable items={lead.items} />
                {lead.estimatedMin != null ? (
                  <Text style={styles.estimateTotal}>
                    الإجمالي التقديري:{" "}
                    {lead.estimatedMax != null && lead.estimatedMax !== lead.estimatedMin
                      ? `${formatEgp(lead.estimatedMin)}–${formatEgp(lead.estimatedMax)}`
                      : formatEgp(lead.estimatedMin)}
                  </Text>
                ) : null}
                {lead.hasOnInspection ? (
                  <Text style={styles.inspectionNote}>فيه بند على الأقل يتحدد بعد المعاينة.</Text>
                ) : null}
              </Section>
            ) : null}

            {lead.completion ? (
              <Section title="المبلغ النهائي">
                <InfoRow label="مبلغ مقدّم الخدمة" value={formatEgp(lead.completion.providerAmount)} />
                {lead.completion.additionalWorkAmount != null ? (
                  <InfoRow label="أعمال إضافية" value={formatEgp(lead.completion.additionalWorkAmount)} />
                ) : null}
                <InfoRow label="الإجمالي" value={formatEgp(lead.completion.finalTotal)} />
                <InfoRow label="حالة التأكيد" value={verificationLabel(lead.completion.verificationStatus)} />
              </Section>
            ) : null}

            {error ? <ErrorCard message={error} /> : null}
          </ScrollView>
        ) : null}

        {lead ? (
          <View style={styles.actionsBar}>
            <Pressable
              style={styles.statusBtn}
              disabled={statusBusy}
              onPress={() => setSheetVisible(true)}
            >
              <Text style={styles.statusBtnLabel}>{statusBusy ? "بيتحدّث..." : "غيّر الحالة"}</Text>
            </Pressable>
          </View>
        ) : null}

        {lead ? (
          <StatusSheet
            visible={sheetVisible}
            current={lead.status}
            // An admin sets Completed directly (requireCompletion is waived
            // for admins server-side — see api's PATCH /leads/[id]); a
            // provider is routed to the completion flow instead, since only
            // that path captures the final amount. See lib/leads.ts's
            // updateLeadStatus comment for the server-side rule this mirrors.
            allowCompleted={admin}
            onSelect={handleStatusSelect}
            onRequestComplete={
              admin
                ? undefined
                : () => {
                    setSheetVisible(false);
                    router.push(`/lead/${lead.id}/complete`);
                  }
            }
            onClose={() => setSheetVisible(false)}
          />
        ) : null}
      </SafeAreaView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function verificationLabel(status: string): string {
  if (status === "CONFIRMED") return "أكّد العميل المبلغ";
  if (status === "DISCREPANCY") return "العميل اعترض على المبلغ";
  return "في انتظار تأكيد العميل";
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  service: { flex: 1, fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  ref: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.outline, textAlign: textStart },
  section: { gap: 8 },
  sectionTitle: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant, textAlign: textStart },
  infoRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 8 },
  infoLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant },
  infoValue: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface },
  contactRow: { flexDirection: "row-reverse", gap: 10, marginTop: 6 },
  contactBtn: { flex: 1, backgroundColor: colors.primaryContainer, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  contactBtnLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimaryContainer },
  description: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, lineHeight: 22, textAlign: textStart },
  estimateTotal: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary, marginTop: 8, textAlign: textStart },
  inspectionNote: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  actionsBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  statusBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  statusBtnLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
