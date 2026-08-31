import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiConversation } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

function relativeTime(epochMs: number | null): string {
  if (epochMs == null) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin < 1) return "دلوقتي";
  if (diffMin < 60) return `${diffMin} د`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} س`;
  return `${Math.round(diffHr / 24)} ي`;
}

function senderPrefix(sender: ApiConversation["lastMessageSender"]): string {
  if (sender === "CUSTOMER") return "";
  if (sender === "PROVIDER") return "انت: ";
  return "الإدارة: ";
}

export default function ThreadRow({ thread, onPress }: { thread: ApiConversation; onPress: () => void }) {
  const unread = thread.providerUnread;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
            {thread.customerName ?? "عميل"}
          </Text>
          <Text style={styles.time}>{relativeTime(thread.lastMessageAt)}</Text>
        </View>
        <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
          {senderPrefix(thread.lastMessageSender)}
          {thread.lastMessagePreview || "لسه مفيش رسائل"}
        </Text>
        {thread.refNumber ? <Text style={styles.ref}>{thread.refNumber}</Text> : null}
      </View>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 14,
  },
  pressed: { opacity: 0.7 },
  info: { flex: 1, gap: 3 },
  topLine: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart, flex: 1 },
  nameUnread: { fontFamily: "Cairo_700Bold" },
  time: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  preview: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  previewUnread: { color: colors.onSurface, fontFamily: "Cairo_600SemiBold" },
  ref: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.outline, textAlign: textStart },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimary },
});
