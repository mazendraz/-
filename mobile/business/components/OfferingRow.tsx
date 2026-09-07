import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { assetUri, rowStart, textStart } from "@alassema/mobile-shared";
import PublishStateChip from "./PublishStateChip";
import { formatOfferingPrice } from "../lib/money";

export default function OfferingRow({
  offering,
  onPress,
  onToggleActive,
}: {
  offering: ApiOffering;
  onPress: () => void;
  onToggleActive: (next: boolean) => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* The offering's own photo, the way the website's price list shows it.
          Only when there is one — an empty grey placeholder on every row would
          cost more space than it earns. */}
      {offering.image ? (
        <Image source={{ uri: assetUri(offering.image) }} style={styles.photo} contentFit="cover" />
      ) : null}
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>{offering.name}</Text>
        <PublishStateChip offering={offering} />
      </View>
      <Text style={styles.price}>{formatOfferingPrice(offering)}</Text>
      {offering.tiers.length > 0 ? <Text style={styles.tiersNote}>{offering.tiers.length} فئة سعر</Text> : null}
      {offering.isPublished ? (
        <View style={styles.activeRow}>
          <Text style={styles.activeLabel}>ظاهر للعملاء</Text>
          <Switch value={offering.isActive} onValueChange={onToggleActive} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: "100%",
    height: 120,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: colors.surfaceContainer,
  },
  row: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  pressed: { opacity: 0.7 },
  top: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  price: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  tiersNote: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  activeRow: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  activeLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
});
