import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiTransaction } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { formatEgp } from "../lib/money";

const TYPE_LABEL: Record<ApiTransaction["type"], string> = {
  COMMISSION_INCOME: "عمولة",
  EXPENSE: "مصروف",
  ADJUSTMENT: "تسوية",
};

/** Shared with the transaction DETAIL screen, which was rendering the raw enum
 *  ("PENDING") while every list row beside it said "معلّقة". Exported rather
 *  than duplicated so the two can't drift apart again. */
export const STATUS_LABEL: Record<ApiTransaction["status"], { label: string; tone: "pending" | "collected" | "disputed" | "void" }> = {
  PENDING: { label: "معلّقة", tone: "pending" },
  COLLECTED: { label: "محصّلة", tone: "collected" },
  DISPUTED: { label: "متنازع عليها", tone: "disputed" },
  VOID: { label: "ملغاة", tone: "void" },
};

export default function TransactionRow({ transaction, onPress }: { transaction: ApiTransaction; onPress?: () => void }) {
  const status = STATUS_LABEL[transaction.status];
  const content = (
    <>
      <View style={styles.top}>
        <Text style={styles.type}>{TYPE_LABEL[transaction.type]}</Text>
        <Text style={[styles.amount, transaction.type === "EXPENSE" && styles.amountNegative]}>
          {transaction.type === "EXPENSE" ? "-" : "+"}{formatEgp(transaction.amount)}
        </Text>
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {transaction.companyName ?? transaction.categoryName ?? "—"}
        {transaction.leadRefNumber ? ` · ${transaction.leadRefNumber}` : ""}
      </Text>
      {transaction.note ? <Text style={styles.note} numberOfLines={1}>{transaction.note}</Text> : null}
      <View style={[styles.statusChip, styles[`status_${status.tone}`]]}>
        <Text style={styles.statusText}>{status.label}</Text>
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14, gap: 4 },
  pressed: { opacity: 0.7 },
  top: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  type: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  amount: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.success },
  amountNegative: { color: colors.error },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  note: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: textStart },
  statusChip: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 2 },
  status_pending: { backgroundColor: colors.secondaryContainer },
  status_collected: { backgroundColor: colors.successContainer },
  status_disputed: { backgroundColor: colors.errorContainer },
  status_void: { backgroundColor: colors.surfaceContainer },
  statusText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
});
