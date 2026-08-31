import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiWaitlistEntry, ApiWaitlistStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

const STATUS_LABEL: Record<ApiWaitlistStatus, string> = {
  WAITING: "بانتظار الدور",
  NOTIFIED: "تم الإشعار",
  CONVERTED: "اتحوّل لطلب",
  CANCELLED: "ملغي",
};

export default function WaitlistRow({
  entry,
  onNotify,
  onConvert,
  onRemove,
}: {
  entry: ApiWaitlistEntry;
  onNotify: () => void;
  onConvert: () => void;
  onRemove: () => void;
}) {
  const isActionable = entry.status === "WAITING" || entry.status === "NOTIFIED";

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name}>{entry.name}</Text>
        {entry.service ? <Text style={styles.service}>{entry.service}</Text> : null}
        <Text style={styles.status}>{STATUS_LABEL[entry.status]}</Text>
      </View>
      {isActionable ? (
        <View style={styles.actions}>
          {entry.status === "WAITING" ? (
            <Pressable style={styles.actionBtn} onPress={onNotify}>
              <Text style={styles.actionLabel}>إشعار</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.actionBtn} onPress={onConvert}>
            <Text style={styles.actionLabel}>قبول</Text>
          </Pressable>
          <Pressable style={styles.removeBtn} onPress={onRemove}>
            <Text style={styles.removeLabel}>حذف</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  info: { gap: 3 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  service: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  status: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  actions: { flexDirection: "row-reverse", gap: 8 },
  actionBtn: { backgroundColor: colors.primaryContainer, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  actionLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimaryContainer },
  removeBtn: { backgroundColor: colors.errorContainer, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  removeLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onErrorContainer },
});
