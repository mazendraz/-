import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import type { ApiTransaction } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { fetchTransactions, setTransactionStatus } from "../../../../lib/controlFinance";
import { formatEgp } from "../../../../lib/money";
import PermissionGate from "../../../../components/PermissionGate";
import Button from "../../../../components/Button";
import StatusTransitionSheet from "../../../../components/StatusTransitionSheet";
import { ListSkeleton, ErrorCard } from "../../../../components/ListStates";
import { STATUS_LABEL } from "../../../../components/TransactionRow";
import { hasDesktopPermission } from "../../../../lib/permissions";
import { useStaffAuth } from "../../../../lib/staffAuth";

const TYPE_LABEL: Record<ApiTransaction["type"], string> = {
  COMMISSION_INCOME: "عمولة",
  EXPENSE: "مصروف",
  ADJUSTMENT: "تسوية",
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/** No single-transaction GET route — same list-is-the-only-read pattern
 *  established since phase 7's offering editor. */
export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useStaffAuth();
  const canWrite = hasDesktopPermission(user, "finance:write");

  const [transaction, setTransaction] = useState<ApiTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const page = await fetchTransactions({ pageSize: 100 });
      const found = page.data.find((t) => t.id === id);
      if (!found) throw new ApiError(404, "المعاملة مش لاقيها.");
      setTransaction(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المعاملة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatusSelect(status: ApiTransaction["status"]) {
    if (!transaction) return;
    setSheetVisible(false);
    setBusy(true);
    try {
      const updated = await setTransactionStatus(transaction.id, status);
      setTransaction(updated);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر تحديث الحالة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "تفاصيل المعاملة" }} />
      <PermissionGate permission="finance:read">
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : error ? (
            <ErrorCard message={error} onRetry={load} />
          ) : transaction ? (
            <>
              <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.amount}>
                  {transaction.type === "EXPENSE" ? "-" : "+"}{formatEgp(transaction.amount)}
                </Text>
                <Text style={styles.type}>{TYPE_LABEL[transaction.type]}</Text>

                <InfoRow label="الحالة" value={STATUS_LABEL[transaction.status].label} />
                {transaction.companyName ? <InfoRow label="الشركة" value={transaction.companyName} /> : null}
                {transaction.leadRefNumber ? <InfoRow label="رقم الطلب" value={transaction.leadRefNumber} /> : null}
                {transaction.categoryName ? <InfoRow label="التصنيف" value={transaction.categoryName} /> : null}
                {transaction.accountName ? <InfoRow label="الحساب" value={transaction.accountName} /> : null}
                <InfoRow label="تاريخ الحدث" value={new Date(transaction.occurredAt).toLocaleDateString("ar-EG")} />
                {transaction.note ? (
                  <View>
                    <Text style={styles.infoLabel}>ملاحظة</Text>
                    <Text style={styles.note}>{transaction.note}</Text>
                  </View>
                ) : null}
              </ScrollView>

              {canWrite ? (
                <View style={styles.actionsBar}>
                  <Button label={busy ? "بيتحدّث..." : "تغيير الحالة"} onPress={() => setSheetVisible(true)} busy={busy} />
                </View>
              ) : null}

              <StatusTransitionSheet
                visible={sheetVisible}
                current={transaction.status}
                busy={busy}
                onSelect={handleStatusSelect}
                onClose={() => setSheetVisible(false)}
              />
            </>
          ) : null}
        </SafeAreaView>
      </PermissionGate>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  amount: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "center" },
  type: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 8 },
  infoRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  infoLabel: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  infoValue: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  note: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, marginTop: 4 },
  actionsBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface },
});
