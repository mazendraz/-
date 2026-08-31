import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { ApiConversation, ApiMessage } from "@alassema/core";
import { colors } from "@alassema/core";
import { ApiError, useLiveEvents } from "@alassema/mobile-shared";
import { fetchThread, sendMessage } from "../../lib/chat";
import MessageBubble from "../../components/MessageBubble";
import Composer from "../../components/Composer";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

const DRAFT_KEY_PREFIX = "al-assema-business-draft-";

// A locally-created bubble not yet confirmed by the server. Negative-ranged
// synthetic ids so they can never collide with a real server id (uuids never
// start with "local-").
interface PendingMessage extends ApiMessage {
  localId?: string;
  pending?: boolean;
  failed?: boolean;
}

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<ApiConversation | null>(null);
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const lastMessageAt = useRef<number | undefined>(undefined);

  // Draft text survives leaving and returning to this thread.
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(DRAFT_KEY_PREFIX + id)
      .then((saved) => {
        if (saved) setDraft(saved);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    AsyncStorage.setItem(DRAFT_KEY_PREFIX + id, draft).catch(() => {});
  }, [id, draft]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  /** Full fetch — marks read on the server. Called on focus, never on a
   *  live-event tick (see lib/chat.ts's fetchThread comment on why that
   *  distinction is load-bearing, not cosmetic). */
  const loadFull = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const result = await fetchThread(id);
      setConversation(result.conversation);
      setMessages(result.messages);
      lastMessageAt.current = result.messages.at(-1)?.createdAt;
      scrollToEnd();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المحادثة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id, scrollToEnd]);

  /** Delta fetch — does NOT mark read. Merges by server id so a message this
   *  screen just sent (already reconciled from the optimistic bubble) is
   *  never duplicated. */
  const loadDelta = useCallback(async () => {
    if (!id) return;
    try {
      const result = await fetchThread(id, lastMessageAt.current);
      if (result.messages.length === 0) return;
      lastMessageAt.current = result.messages.at(-1)!.createdAt;
      setMessages((prev) => {
        const knownIds = new Set(prev.map((m) => m.id));
        const fresh = result.messages.filter((m) => !knownIds.has(m.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      setConversation(result.conversation);
      scrollToEnd();
    } catch {
      // A missed delta tick is not worth surfacing — the next focus does a
      // full fetch regardless, and useLiveEvents retries on reconnect.
    }
  }, [id, scrollToEnd]);

  useFocusEffect(
    useCallback(() => {
      void loadFull();
    }, [loadFull]),
  );

  useLiveEvents((event) => {
    if (event.type === "message" && event.conversationId === id) {
      void loadDelta();
    }
  });

  async function handleSend() {
    const body = draft.trim();
    if (!body || !id || sending) return;

    const localId = `local-${Date.now()}`;
    const optimistic: PendingMessage = {
      id: localId,
      localId,
      sender: "PROVIDER",
      body,
      attachment: null,
      createdAt: Date.now(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    AsyncStorage.removeItem(DRAFT_KEY_PREFIX + id).catch(() => {});
    scrollToEnd();
    setSending(true);

    try {
      const sent = await sendMessage(id, body);
      // Replace the optimistic bubble with the server's real one — never
      // appended beside it, or the message would appear twice.
      setMessages((prev) => prev.map((m) => (m.localId === localId ? sent : m)));
      lastMessageAt.current = Math.max(lastMessageAt.current ?? 0, sent.createdAt);
    } catch {
      // Visible failure with a retry affordance — no background send queue.
      // A silently-queued message that lands an hour later is worse than a
      // failure the sender can see and act on now.
      setMessages((prev) =>
        prev.map((m) => (m.localId === localId ? { ...m, pending: false, failed: true } : m)),
      );
    } finally {
      setSending(false);
    }
  }

  function retry(localId: string) {
    const failedMessage = messages.find((m) => m.localId === localId);
    if (!failedMessage) return;
    setMessages((prev) => prev.filter((m) => m.localId !== localId));
    setDraft(failedMessage.body);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: conversation?.customerName ?? "المحادثة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          {loading ? (
            <ListSkeleton rows={4} />
          ) : error && messages.length === 0 ? (
            <ErrorCard message={error} onRetry={loadFull} />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.localId ?? item.id}
              contentContainerStyle={styles.messages}
              renderItem={({ item }) => (
                <MessageBubble
                  body={item.body}
                  sender={item.sender}
                  createdAt={item.createdAt}
                  mine={item.sender === "PROVIDER"}
                  pending={item.pending}
                  failed={item.failed}
                  onRetry={() => item.localId && retry(item.localId)}
                />
              )}
              onContentSizeChange={scrollToEnd}
            />
          )}
          <Composer value={draft} onChangeText={setDraft} onSend={handleSend} sending={sending} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  messages: { paddingVertical: 12 },
});
