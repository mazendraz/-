import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiMessage } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchThread, sendMessage } from "../../lib/chat";
import { useLiveEvents, ApiError, rowStart } from "@alassema/mobile-shared";

/**
 * A conversation about one request — reached from a chat icon on its card in
 * the Requests tab, which is where `leadId` and `companyName` come from.
 *
 * No dedicated "Messages" list screen yet, even though the account-based
 * summaries endpoint (GET /customer/chat/summaries) is built, tested, and
 * verified live in the last backend pass — every signed-in customer's
 * requests already appear in the Requests tab with a real ApiLead.id, so it
 * doubles as the thread list for now. A proper Messages tab (sorted by recent
 * activity, unread badges, an entry for a lead you haven't opened chat on
 * yet) is real, separate screen design, not a gap in whether messaging
 * WORKS end to end — which this screen proves it does.
 */
export default function Chat() {
  const { leadId, companyName } = useLocalSearchParams<{ leadId: string; companyName?: string }>();
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<FlatList<ApiMessage>>(null);

  const load = useCallback(async () => {
    try {
      const thread = await fetchThread(leadId);
      setMessages(thread.messages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المحادثة.");
    } finally {
      setLoaded(true);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live delivery: any "message" event triggers a reload, same coarse-refetch
  // pattern the Requests tab uses — the SSE payload carries only IDs (see
  // api's realtime.service.ts), never message content, so there is nothing
  // finer-grained to apply.
  useLiveEvents((event) => {
    if (event.type === "message") load();
  });

  async function onSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const message = await sendMessage(leadId, body);
      setMessages((prev) => [...prev, message]);
    } catch (err) {
      setDraft(body); // give the text back so nothing typed is lost
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال الرسالة.");
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_forward" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{companyName || "المحادثة"}</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            loaded ? <Text style={styles.empty}>ابدأ المحادثة — اسأل عن أي حاجة تخص طلبك.</Text> : null
          }
          renderItem={({ item }) => {
            const mine = item.sender === "CUSTOMER";
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                </View>
              </View>
            );
          }}
        />

        {error !== "" && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.composer}>
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="إرسال"
          >
            {/* MaterialIcons' send glyph is a paper plane drawn pointing toward
                LTR's "forward" (upper-right) — RN's RTL flip mirrors layout,
                not a raster/vector glyph's own artwork, so the icon needs an
                explicit mirror to point toward RTL's forward (upper-left)
                instead of silently pointing the wrong way in this layout. */}
            <Icon name="send" size={18} color={colors.onPrimary} style={styles.sendIcon} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="اكتب رسالتك…"
            placeholderTextColor={colors.outline}
            style={styles.input}
            textAlign="right"
            multiline
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, flex: 1, textAlign: "center" },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { textAlign: "center", color: colors.outline, fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, paddingTop: 60 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomEndRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surfaceContainer, borderBottomStartRadius: 4 },
  bubbleText: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  bubbleTextMine: { color: colors.onPrimary },
  errorBanner: { backgroundColor: colors.errorContainer, marginHorizontal: 16, marginBottom: 6, borderRadius: 10, padding: 10 },
  errorText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  composer: {
    flexDirection: rowStart,
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  sendIcon: { transform: [{ scaleX: -1 }] },
});
