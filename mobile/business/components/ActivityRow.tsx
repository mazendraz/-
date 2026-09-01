import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { formatEgp } from "../lib/money";

type ActivityType = "new_request" | "service_completed" | "dispute_raised" | "commission_collected" | "new_client";

const TYPE_LABEL: Record<ActivityType, string> = {
  new_request: "طلب جديد",
  service_completed: "خدمة مكتملة",
  dispute_raised: "اعتراض على سعر",
  commission_collected: "عمولة محصّلة",
  new_client: "عميل جديد",
};

function relativeTime(epochMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin < 1) return "دلوقتي";
  if (diffMin < 60) return `من ${diffMin} دقيقة`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `من ${diffHr} ساعة`;
  return `من ${Math.round(diffHr / 24)} يوم`;
}

export default function ActivityRow({
  activity,
}: {
  activity: { id: string; type: ActivityType; label: string; occurredAt: number; amount: number | null };
}) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.typeTag}>{TYPE_LABEL[activity.type]}</Text>
        <Text style={styles.label} numberOfLines={1}>{activity.label}</Text>
      </View>
      <View style={styles.right}>
        {activity.amount != null ? <Text style={styles.amount}>{formatEgp(activity.amount)}</Text> : null}
        <Text style={styles.time}>{relativeTime(activity.occurredAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, padding: 12, gap: 8 },
  info: { flex: 1, gap: 2 },
  typeTag: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurface, textAlign: textStart },
  right: { alignItems: "flex-end", gap: 2 },
  amount: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  time: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
});
