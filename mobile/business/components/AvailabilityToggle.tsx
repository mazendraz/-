import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import Icon from "./Icon";

/**
 * Manual open/closed control — the mobile counterpart of the website's
 * AvailabilityControl. The state is carried by COLOUR, same as the website:
 * a green card + green track when open for orders, an amber card when busy.
 *
 * The switch's own `trackColor.true` is `colors.success` (a real green),
 * NOT `colors.successContainer` — that token is `#f0fdf4`, i.e. almost
 * white, which is why the "on" state used to look like a dead grey toggle.
 */
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
    <View style={[styles.card, busy ? styles.cardBusy : styles.cardFree]}>
      <View style={styles.row}>
        <Icon
          name={busy ? "event_busy" : "event_available"}
          size={26}
          color={busy ? colors.warning : colors.success}
        />
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
          trackColor={{ false: colors.outlineVariant, true: colors.success }}
          thumbColor={colors.surfaceContainerLowest}
          ios_backgroundColor={colors.outlineVariant}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  cardFree: { backgroundColor: colors.successContainer, borderColor: colors.success },
  cardBusy: { backgroundColor: colors.warningContainer, borderColor: colors.warning },
  row: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", gap: 12 },
  textCol: { flex: 1, gap: 3 },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  subtitle: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
