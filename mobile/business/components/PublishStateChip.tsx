import { StyleSheet, Text, View } from "react-native";
import type { ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";

/**
 * The offering's real-world state — deliberately in the provider's own
 * words, not raw flags. `isPublished` is admin-owned and asynchronous
 * (whether it's EVER been approved to go live); `isActive` is provider-owned
 * and immediate (whether it's showing right now). Confusing the two is the
 * single most likely bug in this screen — see
 * docs/architecture/business-app/phase-7-provider-catalog.md's own note.
 */
export default function PublishStateChip({ offering }: { offering: ApiOffering }) {
  const state = offering.isPublished
    ? offering.isActive
      ? ({ label: "أمام العملاء", tone: "live" } as const)
      : ({ label: "مخفي منك", tone: "hidden" } as const)
    : ({ label: "مسودة", tone: "draft" } as const);

  return (
    <View style={[styles.chip, styles[`chip_${state.tone}`]]}>
      <Text style={[styles.label, styles[`label_${state.tone}`]]}>{state.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  chip_live: { backgroundColor: colors.successContainer },
  chip_hidden: { backgroundColor: colors.surfaceContainer },
  chip_draft: { backgroundColor: colors.secondaryContainer },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold" },
  label_live: { color: colors.onSuccessContainer },
  label_hidden: { color: colors.onSurfaceVariant },
  label_draft: { color: colors.onSecondaryContainer },
});
