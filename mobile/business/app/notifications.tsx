import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ApiStaffNotification,
} from "../lib/notifications";
import { mapNotificationUrl } from "../lib/deepLinks";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

/**
 * The notification center — shared by both roles, so it lives at the top level
 * rather than under (provider) or (admin), the same placement and for the same
 * reason as sessions.tsx.
 *
 * ── Why a tapped row routes through mapNotificationUrl ─────────────────────
 * The stored `url` is a WEB dashboard path ("/provider?tab=messages"), because
 * the same payload is also delivered to browsers by Web Push. That is exactly
 * the translation lib/deepLinks.ts already does for a tapped PUSH notification,
 * so tapping a row here and tapping the push it records land on the same
 * screen — which is the whole point of the list being the delivery record.
 */
export default function Notifications() {
  const [items, setItems] = useState<ApiStaffNotification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const res = await fetchNotifications();
      setItems(res.notifications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الإشعارات. جرّب تاني.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));
  // An SSE event means something new was just published to this account —
  // refetch rather than trying to construct the row locally (events carry ids,
  // never content).
  useLiveEvents(() => void load(true));

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  async function open(n: ApiStaffNotification) {
    if (!n.read) {
      // Optimistic — a failure leaves the server's real (unread) state, which
      // the next refresh restores rather than silently diverging.
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
      try {
        await markNotificationRead(n.id);
      } catch {
        void load(true);
      }
    }
    if (n.url) router.push(mapNotificationUrl(n.url) as never);
  }

  async function markAll() {
    setItems((prev) => prev?.map((x) => ({ ...x, read: true })) ?? null);
    try {
      await markAllNotificationsRead();
    } catch {
      void load(true);
    }
  }

  const hasUnread = (items ?? []).some((n) => !n.read);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "الإشعارات",
          headerRight: hasUnread
            ? () => (
                <Pressable onPress={markAll} hitSlop={8}>
                  <Text style={styles.markAll}>قراءة الكل</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => void load()} />
        ) : (
          <FlatList
            data={items ?? []}
            keyExtractor={(n) => n.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <EmptyCard
                title="مفيش إشعارات"
                message="هيظهر هنا أي تنبيه عن طلب جديد أو رسالة أو موافقة."
              />
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void open(item)}
                style={[styles.row, !item.read && styles.rowUnread]}
              >
                <View style={styles.rowInner}>
                  {!item.read ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
                  <View style={styles.texts}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.body}>{item.body}</Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  markAll: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.primary,
    paddingHorizontal: 8,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  rowUnread: { backgroundColor: colors.surfaceContainer },
  // row-reverse, not `flexDirection: "row"` — this app forces RTL, and the
  // unread dot belongs at the inline START (the right, in Arabic).
  rowInner: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
  dotSpacer: { width: 8 },
  texts: { flex: 1, gap: 2 },
  title: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  body: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
});
