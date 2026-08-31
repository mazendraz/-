import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export default function AvailabilityToggle({
  busy,
  busyUntil,
  onToggle,
  disabled,
}: {
  busy: boolean;
  busyUntil: number | null | undefined;
  onToggle: (nextBusy: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>{busy ? "مشغول دلوقتي" : "متاح للطلبات"}</Text>
          <Text style={styles.subtitle}>
            {busy
              ? busyUntil
                ? `هيرجع يفتح تلقائيًا يوم ${new Date(busyUntil).toLocaleDateString("ar-EG")}`
                : "مقفول لحد ما تفتحه بنفسك"
              : "بتستقبل طلبات جديدة عادي"}
          </Text>
        </View>
        <Switch
          value={!busy}
          onValueChange={(next) => onToggle(!next)}
          disabled={disabled}
          trackColor={{ false: colors.errorContainer, true: colors.successContainer }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    padding: 16,
  },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12 },
  textCol: { flex: 1, gap: 3 },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  subtitle: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
