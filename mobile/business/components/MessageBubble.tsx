import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { MessageSenderValue } from "@alassema/core";
import { colors, type } from "@alassema/core";

function timeLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

const SENDER_LABEL: Record<MessageSenderValue, string> = {
  CUSTOMER: "العميل",
  PROVIDER: "أنت",
  ADMIN: "الإدارة",
};

/**
 * One message. Own messages (PROVIDER, since this screen is always the
 * provider side of the thread) sit on the physical right — the near-
 * universal chat convention regardless of RTL/LTR text direction, same as
 * every mainstream chat app.
 */
export default function MessageBubble({
  body,
  sender,
  createdAt,
  mine,
  pending,
  failed,
  onRetry,
  hidden,
  onToggleHide,
}: {
  body: string;
  sender: MessageSenderValue;
  createdAt: number;
  mine: boolean;
  pending?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  /** Only ever set in the admin thread view — see ApiMessage.hidden's own
   *  comment: the other viewers never receive a hidden row at all. */
  hidden?: boolean;
  /** Admin-only moderation control (PATCH .../messages/[id] { hidden }) —
   *  undefined for both the provider and customer views. */
  onToggleHide?: () => void;
}) {
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, hidden && styles.bubbleHidden]}>
        {!mine ? <Text style={styles.sender}>{SENDER_LABEL[sender]}</Text> : null}
        <Text style={[styles.body, mine ? styles.bodyMine : styles.bodyTheirs]}>{body}</Text>
        <View style={styles.metaRow}>
          {pending ? <ActivityIndicator size="small" color={mine ? colors.onPrimary : colors.onSurfaceVariant} /> : null}
          {hidden ? <Text style={[styles.hiddenTag, mine ? styles.timeMine : styles.timeTheirs]}>مخفية</Text> : null}
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>{timeLabel(createdAt)}</Text>
        </View>
        {failed ? (
          <Pressable onPress={onRetry} style={styles.retry}>
            <Text style={styles.retryText}>فشل الإرسال — اضغط للمحاولة تاني</Text>
          </Pressable>
        ) : null}
        {onToggleHide ? (
          <Pressable onPress={onToggleHide} style={styles.moderate}>
            <Text style={[styles.moderateText, mine ? styles.timeMine : styles.timeTheirs]}>
              {hidden ? "إظهار" : "إخفاء"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 3, paddingHorizontal: 12 },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomEndRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surfaceContainer, borderBottomStartRadius: 4 },
  sender: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary, marginBottom: 2 },
  body: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", lineHeight: 21 },
  bodyMine: { color: colors.onPrimary },
  bodyTheirs: { color: colors.onSurface },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 3, alignSelf: "flex-end" },
  time: { fontSize: 10, fontFamily: "Cairo_400Regular" },
  timeMine: { color: "rgba(255,255,255,0.75)" },
  timeTheirs: { color: colors.outline },
  retry: { marginTop: 4 },
  retryText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.error },
  bubbleHidden: { opacity: 0.55, borderWidth: 1, borderColor: colors.error, borderStyle: "dashed" },
  hiddenTag: { fontSize: 10, fontFamily: "Cairo_700Bold" },
  moderate: { marginTop: 2 },
  moderateText: { fontSize: 10, fontFamily: "Cairo_600SemiBold", textDecorationLine: "underline" },
});
