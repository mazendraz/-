import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiConversation } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import Avatar from "./Avatar";

/**
 * One conversation in the Messages list.
 *
 * ── Why it leads with an avatar ────────────────────────────────────────────
 * The list used to be a stack of identical bordered boxes of text, which is
 * the one layout a messaging list should never be: with nothing anchoring the
 * start of each row, scanning for a particular person meant reading rather
 * than glancing. A leading initial circle gives every row the same visual
 * hook, which is why every mainstream messaging surface has one.
 *
 * ── Units, not initials ────────────────────────────────────────────────────
 * The timestamp used to abbreviate to a single Arabic letter ("٢ ي", "٣ س").
 * That renders correctly — a digit followed by an Arabic letter in an RTL
 * paragraph puts the number on the right, which is right — but a lone "ي" is
 * not a word anyone reads as "days", and the app already spells this out in
 * full one screen away (LeadRow's "من ٢ يوم"). Two surfaces describing the
 * same lead's age in two different notations is a smaller problem than either
 * one being unreadable, so both now use words.
 */
function relativeTime(epochMs: number | null): string {
  if (epochMs == null) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin < 1) return "دلوقتي";
  if (diffMin < 60) return `${diffMin} دقيقة`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ساعة`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} يوم`;
  return `${Math.round(diffDay / 30)} شهر`;
}

function senderPrefix(sender: ApiConversation["lastMessageSender"]): string {
  if (sender === "CUSTOMER") return "";
  if (sender === "PROVIDER") return "انت: ";
  return "الإدارة: ";
}

export default function ThreadRow({ thread, onPress }: { thread: ApiConversation; onPress: () => void }) {
  const unread = thread.providerUnread;
  const name = thread.customerName ?? "عميل";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `${name}، ${unread} رسالة غير مقروءة` : name
      }
    >
      {/* An unread thread gets the brand colour; a read one recedes to the
          neutral, so the list's unread state survives a glance. */}
      <Avatar name={name} size={46} color={unread > 0 ? colors.primary : colors.outline} />

      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
            {name}
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
          <Text style={styles.badgeText} allowFontScaling={false}>
            {unread > 9 ? "9+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: colors.surfaceContainer },
  info: { flex: 1, gap: 3 },
  topLine: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: {
    flex: 1,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
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
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.caption.fontSize,
    color: colors.onPrimary,
    // Centres the digit in its circle — same reason as Avatar's own note.
    lineHeight: 22,
    includeFontPadding: false,
    textAlign: "center",
  },
});
