import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import MediaLightbox from "./MediaLightbox";
import OfferingCard from "./OfferingCard";
import { formatPrice, isQuoteOnly } from "../lib/pricing";
import { rowStart, displayLine } from "@alassema/mobile-shared";

/**
 * One titled block of the price list (الخدمات / المنتجات) — the mobile
 * counterpart of the website's OfferingGroup in OfferingCards.tsx.
 *
 * It exists to own ONE photo viewer for the whole block instead of one per
 * card: a customer opens a product photo and then flips through the rest of
 * the section without going back to the list between each. Cards with no photo
 * are skipped, so the viewer's index runs over `withPhoto`, not `items`.
 */
export default function OfferingGroup({ title, items, onAdd }: {
  title: string;
  items: ApiOffering[];
  /** Navigate into the request form with this offering pre-selected. */
  onAdd: (offeringId: string) => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const withPhoto = items.filter((o) => o.image);
  const photos = withPhoto.map((o) => ({
    src: o.image!,
    caption: `${o.name} · ${formatPrice(o)}`,
    footer: (
      <PhotoFooter
        offering={o}
        onAdd={() => {
          // Close first: `onAdd` navigates, and leaving a full-screen modal
          // open over the push means the customer lands on the request form
          // behind a black sheet.
          setLightboxIdx(null);
          onAdd(o.id);
        }}
      />
    ),
  }));

  return (
    <View style={styles.group}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.map((o) => (
          <OfferingCard
            key={o.id}
            offering={o}
            onAdd={() => onAdd(o.id)}
            onOpenPhoto={o.image ? () => setLightboxIdx(withPhoto.indexOf(o)) : undefined}
          />
        ))}
      </View>

      {lightboxIdx !== null && photos.length > 0 && (
        <MediaLightbox
          items={photos}
          index={lightboxIdx}
          onIndex={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          label={title}
        />
      )}
    </View>
  );
}

/**
 * The bar under the photo in the viewer: name, price, and the same add button
 * the card has. Without it, a customer who likes what they see has to close the
 * viewer, find the card again, and only then add it — the decision happens
 * while the photo is open, so the action belongs there too.
 */
function PhotoFooter({ offering, onAdd }: { offering: ApiOffering; onAdd: () => void }) {
  const quote = isQuoteOnly(offering);

  return (
    <View style={styles.footer}>
      <View style={styles.footerText}>
        <Text style={styles.footerName} numberOfLines={2}>{offering.name}</Text>
        <Text style={[styles.footerPrice, quote && styles.footerPriceQuote]}>{formatPrice(offering)}</Text>
        {offering.minQty != null && <Text style={styles.footerMinQty}>الحد الأدنى {offering.minQty}</Text>}
      </View>

      <Pressable
        style={styles.addBtn}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={`أضف للطلب — ${offering.name}`}
      >
        <Icon name="add" size={18} color={colors.onPrimary} />
        <Text style={styles.addBtnText}>أضف للطلب</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  title: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, textAlign: "right" },
  list: { gap: 12 },
  footer: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerText: { flex: 1, minWidth: 0 },
  footerName: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: "#fff", textAlign: "right" },
  footerPrice: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.subhead.fontSize, lineHeight: displayLine(type.subhead.fontSize), color: "#fff", textAlign: "right", marginTop: 2 },
  footerPriceQuote: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: "rgba(255,255,255,0.85)" },
  footerMinQty: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: "rgba(255,255,255,0.6)", textAlign: "right", marginTop: 2 },
  addBtn: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
