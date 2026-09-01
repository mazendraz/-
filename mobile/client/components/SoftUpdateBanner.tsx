import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import { rowStart } from "@alassema/mobile-shared";

/**
 * Dismissible "an update is available" banner — the non-blocking counterpart
 * of UpdateRequiredScreen. That screen exists for `minimum` (a broken
 * contract or security fix: the app CANNOT continue); this exists for
 * `latest` (there's a nicer build available, no urgency) — see
 * app/_layout.tsx for how the two are told apart and @alassema/mobile-shared's
 * appVersion.ts dismissal helpers for why dismissing this one doesn't
 * suppress it forever.
 *
 * Floats over the top of whatever screen is showing rather than taking a
 * layout slot, so it can appear/disappear without reflowing the screen
 * beneath it — same reasoning as GuestPromptModal being a Modal rather than
 * an inline banner.
 */
export default function SoftUpdateBanner({
  message,
  iosUrl,
  androidUrl,
  onDismiss,
}: {
  message: string | null;
  iosUrl: string | null;
  androidUrl: string | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const storeUrl = Platform.OS === "ios" ? iosUrl : androidUrl;

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.card}>
        <Icon name="system_update" size={18} color={colors.primary} />
        <Text style={styles.text} numberOfLines={2}>
          {message?.trim() || "فيه نسخة جديدة من التطبيق متاحة."}
        </Text>
        {storeUrl && (
          <Pressable onPress={() => Linking.openURL(storeUrl)} hitSlop={8}>
            <Text style={styles.action}>حدّث</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={onDismiss} hitSlop={8}>
          <Icon name="close" size={16} color={colors.outline} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 20 },
  card: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  text: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: type.caption.fontSize, color: colors.onSurface, textAlign: "right" },
  action: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary },
});
