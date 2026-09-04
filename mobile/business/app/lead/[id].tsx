import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiLead, ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useLiveEvents } from "@alassema/mobile-shared";
import { fetchLead, updateLeadStatus } from "../../lib/leads";
import { fetchConversationForLead } from "../../lib/chat";
import { fetchAdminLead, deleteAdminLead } from "../../lib/adminLeads";
import { fetchAdminConversationForLead } from "../../lib/adminChat";
import { isAdmin } from "../../lib/permissions";
import { useStaffAuth } from "../../lib/staffAuth";
import StatusPill from "../../components/StatusPill";
import StatusSheet from "../../components/StatusSheet";
import ItemsTable from "../../components/ItemsTable";
import Icon from "../../components/Icon";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";
import { formatEgp } from "../../lib/money";

/**
 * Shared between the provider and admin tab groups (both link here as
 * `/lead/${id}`) — the data module is swapped by role, the screen isn't
 * duplicated. See lib/leads.ts's and lib/adminLeads.ts's header comments for
 * why these live in separate files: `providerOnly`/`adminOnly` are both
 * strict role equality, so the wrong one 403s outright.
 */
export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useStaffAuth();
  const admin = isAdmin(user);
  const [lead, setLead] = useState<ApiLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setLead(await (admin ? fetchAdminLead(id) : fetchLead(id)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الطلب. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id, admin]);

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

  async function openChat() {
    if (!lead || openingChat) return;
    setOpeningChat(true);
    try {
      if (admin) {
        // No admin route resolves a conversation directly from a leadId (see
        // lib/adminChat.ts's fetchAdminConversationForLead comment) — this
        // can legitimately come back null if admin/chat's ref-number search
        // hasn't caught up with a conversation created moments ago.
        const conversation = await fetchAdminConversationForLead(lead.refNumber);
        if (!conversation) throw new ApiError(404, "لسه المحادثة مش لاقيها — جرّب تاني بعد شوية.");
        router.push(`/chat/${conversation.id}`);
      } else {
        // Every lead already has exactly one conversation, created eagerly at
        // submission — this can only fail if the lead id itself is wrong.
        const conversation = await fetchConversationForLead(lead.id);
        router.push(`/chat/${conversation.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر فتح المحادثة. جرّب تاني.");
    } finally {
      setOpeningChat(false);
    }
  }

  function handleDelete() {
    if (!lead) return;
    Alert.alert(
      "حذف الطلب",
      `هل تريد حذف الطلب ${lead.refNumber} نهائيًا؟ هيتحذف كمان المحادثة المرتبطة بيه، ولا يمكن التراجع.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAdminLead(lead.id);
              router.back();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "تعذّر حذف الطلب.");
              setDeleting(false);
            }
          },
        },
      ],
    );
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
              {/* Two channels only, both first-party: the in-app thread and the
                  device dialer. WhatsApp used to sit between them, which sent
                  the conversation somewhere the platform cannot see — no
                  thread, no moderation, no record on the lead. `رسالة` is the
                  filled/primary action because the in-app thread is the one
                  the product can actually support. */}
              <View style={styles.contactRow}>
                <Pressable
                  style={({ pressed }) => [styles.contactBtn, styles.contactBtnPrimary, pressed && styles.contactBtnPressed]}
                  onPress={openChat}
                  disabled={openingChat}
                  accessibilityRole="button"
                  accessibilityLabel="فتح محادثة العميل"
                >
                  <Icon name="chat" size={18} color={colors.onPrimary} />
                  <Text style={[styles.contactBtnLabel, styles.contactBtnLabelPrimary]}>
                    {openingChat ? "..." : "رسالة"}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.contactBtn, pressed && styles.contactBtnPressed]}
                  onPress={call}
                  accessibilityRole="button"
                  accessibilityLabel={`اتصال بالعميل ${lead.phone}`}
                >
                  <Icon name="call" size={18} color={colors.onPrimaryContainer} />
                  <Text style={styles.contactBtnLabel}>اتصال</Text>
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
            <View style={styles.actionsRow}>
              <Pressable
                style={styles.statusBtn}
                disabled={statusBusy}
                onPress={() => setSheetVisible(true)}
              >
                <Text style={styles.statusBtnLabel}>{statusBusy ? "بيتحدّث..." : "غيّر الحالة"}</Text>
              </Pressable>
              {admin ? (
                <Pressable style={styles.deleteBtn} disabled={deleting} onPress={handleDelete}>
                  <Text style={styles.deleteBtnLabel}>{deleting ? "..." : "حذف"}</Text>
                </Pressable>
              ) : null}
            </View>
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
  contactRow: { flexDirection: "row-reverse", gap: 10, marginTop: 10 },
  contactBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryContainer,
    borderRadius: 12,
    // 48px — a comfortable target, and equal for both so neither reads as
    // secondary by accident.
    minHeight: 48,
    paddingHorizontal: 12,
  },
  contactBtnPrimary: { backgroundColor: colors.primary },
  contactBtnPressed: { opacity: 0.75 },
  contactBtnLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimaryContainer },
  contactBtnLabelPrimary: { color: colors.onPrimary },
  description: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, lineHeight: 22, textAlign: textStart },
  estimateTotal: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary, marginTop: 8, textAlign: textStart },
  inspectionNote: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  actionsBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  actionsRow: { flexDirection: "row-reverse", gap: 10 },
  statusBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  statusBtnLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  deleteBtn: { backgroundColor: colors.errorContainer, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center" },
  deleteBtnLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onErrorContainer },
});
