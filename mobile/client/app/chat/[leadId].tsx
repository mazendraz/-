import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
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
import MenuButton from "../../components/MenuButton";
import { fetchThread, sendMessage } from "../../lib/chat";
import { refreshUnreadMessages } from "../../lib/unreadStore";
import { useLiveEvents, useCoalescedReload, useSingleSubmit, ApiError, rowStart } from "@alassema/mobile-shared";

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

  /**
   * Which thread read is allowed to win.
   *
   * A reload can be in flight when the customer hits send — the SSE stream
   * fires a `message` event for the company's own reply while a thread read
   * is already running, and the two settle in whatever order the network
   * decides. Without a guard, a read that STARTED before the send and landed
   * after it called `setMessages(thread.messages)` with a list that predates
   * the sent message, and the message the customer had just watched appear
   * silently vanished from the thread — recoverable only by leaving and
   * coming back.
   *
   * Bumping this on send is what makes the sent message authoritative: every
   * read older than it is discarded, and the next read (a live event, or the
   * coalesced follow-up below) fetches a thread that contains it.
   */
  const readId = useRef(0);

  const load = useCallback(async () => {
    const id = ++readId.current;
    try {
      const thread = await fetchThread(leadId);
      if (id !== readId.current) return;
      setMessages(thread.messages);
      // A successful read means the thread is on screen again — the banner
      // from an earlier failure has nothing left to describe. It used to be
      // set once and never cleared, so one transient failure left a red
      // error bar sitting above a perfectly healthy conversation for the
      // rest of the visit.
      setError("");
      // A full read (no `after` cursor) zeroes this conversation's
      // customerUnread server-side — see api's customer/leads/[id]/messages
      // route calling chat.markRead. Re-ask for the totals so the tab badge
      // drops the moment the thread opens instead of a poll later.
      void refreshUnreadMessages();
    } catch (err) {
      if (id !== readId.current) return;
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المحادثة.");
    } finally {
      setLoaded(true);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live delivery: a "message" event triggers a reload, same coarse-refetch
  // pattern the Requests tab uses — the SSE payload carries only IDs (see
  // api's realtime.service.ts), never message content, so there is nothing
  // finer-grained to apply.
  //
  // Two narrowings over the old `if (event.type === "message") load()`:
  //  - the event names the lead it belongs to, so a reply on a DIFFERENT
  //    request no longer refetches this thread (it did, and this screen was
  //    only one of five consumers doing something on that same event);
  //  - it is coalesced, so a company sending several messages in a row costs
  //    one refetch and a single follow-up rather than one read per message,
  //    all racing each other into setMessages.
  const reload = useCoalescedReload(load);
  useLiveEvents((event) => {
    if (event.type === "reconnect") reload();
    // `!event.leadId` is defensive: every `message` the server publishes
    // carries one today (realtime.service.ts), and if that ever stopped being
    // true, refetching too often is the right way to be wrong here.
    if (event.type === "message" && (!event.leadId || event.leadId === leadId)) reload();
  });

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const message = await sendMessage(leadId, body);
      // See readId: this discards any thread read that started before the
      // send, so none of them can land afterwards with a list that predates
      // this message.
      readId.current += 1;
      setMessages((prev) => [...prev, message]);
      setError("");
    } catch (err) {
      setDraft(body); // give the text back so nothing typed is lost
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال الرسالة.");
    } finally {
      setSending(false);
    }
  }

  // `sending` is state and lands a render late, so two taps in one frame both
  // read the old `false` AND the same un-cleared `draft` — the identical
  // message went out twice. See useSingleSubmit.
  const onSend = useSingleSubmit(send);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_forward" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{companyName || "المحادثة"}</Text>
        {/* Was an empty 22-wide counterweight balancing the back arrow so
            the title stayed centred. The menu is the same width, so nothing
            has moved. */}
        <MenuButton size={22} />
      </View>

      {/* `behavior="padding"` on ANDROID too, not just iOS.
          Leaving it undefined here relied on the Activity's
          `windowSoftInputMode="adjustResize"` shrinking the window so a flex
          column would lift the composer on its own. That stopped being true
          when this app went edge-to-edge (android/gradle.properties'
          `edgeToEdgeEnabled=true`): the window then draws behind the system
          bars and no longer resizes for the IME, so nothing moved and the
          composer sat underneath the keyboard — reported as "the chat box
          doesn't rise above the keyboard like WhatsApp". */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
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
  // Deliberately a hardcoded "row", not `rowStart`: the two modifiers below
  // pick a SIDE, and under the RTL engine plain "row" puts flex-end on the
  // left — which is where an outgoing message belongs in an RTL thread, and
  // where the website puts it too (ChatThread.tsx's `justify-end` on a
  // dir="rtl" page resolves the same way).
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
