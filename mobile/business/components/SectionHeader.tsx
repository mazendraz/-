import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";

/**
 * A list section's title, with an optional action on the far side.
 *
 * ── Why the action belongs in the header ───────────────────────────────────
 * The overviews show the FIRST few of something — five recent leads, three
 * busiest companies — and then simply stop. A truncated list with no way
 * forward reads as the whole list, so a provider who has more than five leads
 * had no signal from this screen that the rest existed. Putting "عرض الكل"
 * beside the title is the smallest thing that says "this is a preview", and it
 * puts the way out where people already look for it.
 *
 * The title also drops from the 22px display size the overviews used to use.
 * At that weight a section label competed with the KPI numbers underneath it,
 * which are the actual content — a heading should organise a screen, not win
 * it.
 */
export default function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  /** Omit both to render a plain heading — never a link that goes nowhere. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          // The label alone is a small target; the padding below carries it to
          // a comfortable one without making the text look inset.
          hitSlop={8}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    marginBottom: 2,
  },
  title: {
    flex: 1,
    fontSize: type.subhead.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  action: { paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 8 },
  actionPressed: { backgroundColor: colors.surfaceContainerHigh },
  actionText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.primary,
  },
});
