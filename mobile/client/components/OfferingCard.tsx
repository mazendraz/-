import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import { formatPrice, formatQtyRange, isQuoteOnly } from "../lib/pricing";
import { assetUri, rowStart, displayLine } from "@alassema/mobile-shared";

/**
 * A single priced service/product card — the mobile counterpart of the
 * website's OfferingCard in OfferingCards.tsx. `onAdd` is a request to
 * navigate into the request form with this offering pre-selected (see
 * new-request/[slug].tsx's `offeringId` param) rather than a local
 * add-to-basket action: the actual multi-item basket UI already lives in
 * that form's OfferingPicker, and duplicating basket STATE here would mean
 * two sources of truth for the same selection.
 *
 * `onOpenPhoto` opens the GROUP's viewer (see OfferingGroup) at this card
 * rather than a viewer owned here: the point of the viewer is flipping through
 * every product photo in the section without dropping back to the list, which
 * a per-card viewer can't do.
 */
export default function OfferingCard({ offering, onAdd, onOpenPhoto }: {
  offering: ApiOffering;
  onAdd: () => void;
  /** Omitted when the offering has no photo. */
  onOpenPhoto?: () => void;
}) {
  const quote = isQuoteOnly(offering);

  return (
    <View style={styles.card}>
      {offering.image && (
        <Pressable onPress={onOpenPhoto} accessibilityRole="button" accessibilityLabel={`عرض صورة — ${offering.name}`}>
          <Image source={{ uri: assetUri(offering.image) }} style={styles.image} />
          <View style={styles.zoomHint} pointerEvents="none">
            <Icon name="zoom_in" size={16} color="#fff" />
          </View>
        </Pressable>
      )}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name}>{offering.name}</Text>
          {quote && (
            <View style={styles.quoteBadge}>
              <Text style={styles.quoteBadgeText}>بعد المعاينة</Text>
            </View>
          )}
        </View>

        {offering.description ? <Text style={styles.desc}>{offering.description}</Text> : null}

        {offering.tiers.length > 0 && (
          <View style={styles.tiers}>
            {offering.tiers.map((tier) => {
              const range = formatQtyRange(tier);
              return (
                <View key={tier.id} style={styles.tierRow}>
                  <Text style={styles.tierLabel} numberOfLines={1}>
                    {tier.label}{range ? ` · ${range}` : ""}
                  </Text>
                  {tier.priceMin != null && (
                    <Text style={styles.tierPrice}>
                      {formatPrice({
                        pricingModel: tier.priceMax != null && tier.priceMax !== tier.priceMin ? "RANGE" : "FIXED",
                        priceMin: tier.priceMin,
                        priceMax: tier.priceMax,
                        unit: null,
                      })}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.footer}>
          {/* Shrinkable, so the widest price this catalogue can produce
              ("من 100,000 ج / م²") wraps inside its own column instead of
              pushing the add button past the card's `overflow: "hidden"`
              edge, which is what clipped it on a 320dp phone. */}
          <View style={styles.priceCol}>
            <Text style={[styles.price, quote && styles.priceQuote]}>{formatPrice(offering)}</Text>
            {offering.minQty != null && <Text style={styles.minQty}>الحد الأدنى {offering.minQty}</Text>}
          </View>
          <Pressable style={styles.addBtn} onPress={onAdd} accessibilityRole="button" accessibilityLabel={`أضف للطلب — ${offering.name}`}>
            <Icon name="add" size={16} color={colors.onPrimary} />
            <Text style={styles.addBtnText}>أضف للطلب</Text>
          </Pressable>
        </View>

        {offering.note ? <Text style={styles.note}>{offering.note}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: "hidden",
  },
  image: { width: "100%", height: 140, backgroundColor: colors.surfaceContainer },
  zoomHint: { position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 4 },
  body: { padding: 14, gap: 8 },
  headerRow: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  name: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  quoteBadge: { backgroundColor: colors.secondaryContainer, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  quoteBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.onSecondaryContainer },
  desc: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 20 },
  tiers: { gap: 4, backgroundColor: colors.surfaceContainer, borderRadius: 10, padding: 8 },
  tierRow: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", gap: 8 },
  tierLabel: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant, textAlign: "right" },
  tierPrice: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface },
  footer: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 2 },
  // `minWidth: 0` alongside flexShrink: RN will not shrink a flex child below
  // its content's intrinsic width without it, so the shrink alone would not
  // actually let a long price reflow.
  priceCol: { flexShrink: 1, minWidth: 0 },
  price: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.subhead.fontSize, lineHeight: displayLine(type.subhead.fontSize), color: colors.primary },
  priceQuote: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.secondary },
  minQty: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, marginTop: 2 },
  // flexShrink: 0 — the button keeps its full label; the price column above
  // is the side that gives way.
  addBtn: { flexShrink: 0, flexDirection: rowStart, alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimary },
  note: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, fontStyle: "italic", textAlign: "right" },
});
