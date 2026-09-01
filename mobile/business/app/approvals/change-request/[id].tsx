import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchChangeRequest, reviewChangeRequest, CHANGE_ENTITY_LABEL } from "../../../lib/approvals";
import type { ApiChangeRequest } from "../../../lib/profile";
import { changeRequestQueue } from "../../../lib/approvalsStore";
import DiffBlock from "../../../components/DiffBlock";
import ApproveRejectBar from "../../../components/ApproveRejectBar";
import RejectNoteSheet from "../../../components/RejectNoteSheet";
import WaitingFor from "../../../components/WaitingFor";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

const OPERATION_LABEL: Record<ApiChangeRequest["operation"], string> = {
  PUBLISH: "طلب نشر",
  UPDATE: "طلب تعديل",
  DELETE: "طلب حذف",
};

export default function ChangeRequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<ApiChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectSheetVisible, setRejectSheetVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setRequest(await fetchChangeRequest(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الطلب. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove() {
    if (!request || busy) return;
    setBusy(true);
    try {
      await reviewChangeRequest(request.id, { action: "approve" });
      changeRequestQueue.removeItem(request.id);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الموافقة. جرّب تاني.");
      setBusy(false);
    }
  }

  async function handleReject(note: string) {
    if (!request || busy) return;
    setBusy(true);
    try {
      await reviewChangeRequest(request.id, { action: "reject", reviewNote: note || undefined });
      changeRequestQueue.removeItem(request.id);
      setRejectSheetVisible(false);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الرفض. جرّب تاني.");
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "طلب تعديل" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error && !request ? (
          <ErrorCard message={error} onRetry={load} />
        ) : request ? (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.header}>
                <Text style={styles.title}>
                  {CHANGE_ENTITY_LABEL[request.entity]} · {OPERATION_LABEL[request.operation]}
                </Text>
                <WaitingFor createdAt={request.createdAt} />
              </View>
              <Text style={styles.company}>{request.companyName ?? request.companyId}</Text>
              {request.note ? <Text style={styles.note}>ملاحظة مقدّم الخدمة: {request.note}</Text> : null}

              {request.entityMissing ? (
                <View style={styles.warnCard}>
                  <Text style={styles.warnText}>السجل الأصلي اتحذف — الموافقة على الطلب ده مش هتنفع.</Text>
                </View>
              ) : request.conflicts && request.conflicts.length > 0 ? (
                <View style={styles.warnCard}>
                  <Text style={styles.warnText}>
                    بعض الحقول اتغيّرت من أدمن تاني بعد ما اتبعت الطلب — شايف علامة "تغيّر بعد الطلب" تحت.
                  </Text>
                </View>
              ) : null}

              <DiffBlock entity={request.entity} changes={request.changes} snapshot={request.snapshot} conflicts={request.conflicts} />

              {error ? <ErrorCard message={error} /> : null}
            </ScrollView>

            <View style={styles.actionsBar}>
              <ApproveRejectBar
                busy={busy}
                onApprove={handleApprove}
                onReject={() => setRejectSheetVisible(true)}
              />
            </View>

            <RejectNoteSheet
              visible={rejectSheetVisible}
              busy={busy}
              onClose={() => setRejectSheetVisible(false)}
              onConfirm={handleReject}
            />
          </>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  note: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, lineHeight: 20 },
  warnCard: { backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12 },
  warnText: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onErrorContainer, textAlign: textStart },
  actionsBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface },
});
