import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCustomerNotification, ApiCustomerNotificationType } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon, { type IconName } from "../components/Icon";
import MenuButton from "../components/MenuButton";
import {
  fetchNotificationPreferences,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from "../lib/notifications";
import { useLiveEvents, rowStart, textStart } from "@alassema/mobile-shared";
import { useRequireAccount } from "../lib/authGate";

const DAY_MS = 86_400_000;

/**
 * Inbox-style timestamp — identical rule to messages.tsx's formatThreadTime
 * (today's time, "أمس" for yesterday, weekday within the week, else a short
 * date), duplicated rather than shared: this codebase keeps each screen's
 * formatter local (see PriceVerificationGate's own date format) rather than
 * growing a shared util for what's currently two call sites.
 */
function formatNotificationTime(ts: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(ts);
  if (ts >= startOfToday) {
    return d.toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
  }
  if (ts >= startOfToday - DAY_MS) return "أمس";
  if (ts >= startOfToday - 6 * DAY_MS) return d.toLocaleDateString("ar-EG", { weekday: "short" });
  return d.toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" });
}

// One icon + tint per NotificationType — keeps the list scannable without
// reading every title. MARKETING gets a visually distinct (secondary,
// warm) treatment so it never gets mistaken for an order update at a glance.
const TYPE_STYLE: Record<ApiCustomerNotificationType, { icon: IconName; tint: string; bg: string }> = {
  LEAD_CREATED: { icon: "receipt_long", tint: colors.primary, bg: "rgba(0, 85, 120, 0.08)" },
  LEAD_STATUS: { icon: "hourglass_top", tint: colors.primary, bg: "rgba(0, 85, 120, 0.08)" },
  LEAD_COMPLETED: { icon: "check_circle", tint: colors.success, bg: colors.successContainer },
  CHAT_MESSAGE: { icon: "chat_bubble", tint: colors.primary, bg: "rgba(0, 85, 120, 0.08)" },
  WAITLIST_NOTIFIED: { icon: "notifications_active", tint: colors.primary, bg: "rgba(0, 85, 120, 0.08)" },
  MARKETING: { icon: "campaign", tint: colors.secondary, bg: colors.secondaryContainer },
};

/**
 * The customer's notification center — every push they've ever received,
 * with real read state (backed by the `Notification` table; see the API's
 * notifications.customer.service.ts). Previously a push that arrived while
 * the app was closed, or got swiped away, was gone for good; this is where
 * it lives afterward.
 *
 * The two switches at the top are the marketing opt-out App Store/Play both
 * require — order/account notifications below are never gated by them (see
 * notifyCustomer's own comment on that split).
 */
export default function Notifications() {
  const customer = useRequireAccount("/notifications");
  const [rows, setRows] = useState<ApiCustomerNotification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState<{ marketingPushEnabled: boolean; marketingEmailEnabled: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (!customer) return;
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const [res, p] = await Promise.all([fetchNotifications(), fetchNotificationPreferences()]);
      setRows(res.notifications);
      setUnreadCount(res.unreadCount);
      setPrefs(p);
    } catch {
      setError("تعذّر تحميل الإشعارات.");
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, [customer]);

  useEffect(() => {
    load();
  }, [load]);

  // A push arriving while this screen is open should show up without a
  // manual pull-to-refresh — same live-event trigger messages.tsx already
  // uses for its own list.
  useLiveEvents((event) => {
    if (event.type === "message" || event.type === "lead-status" || event.type === "lead") load();
  });

  async function onOpen(n: ApiCustomerNotification) {
    if (!n.read) {
      setRows((prev) => prev?.map((r) => (r.id === n.id ? { ...r, read: true } : r)) ?? prev);
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.url) router.push(n.url as never);
  }

  async function onMarkAllRead() {
    setRows((prev) => prev?.map((r) => ({ ...r, read: true })) ?? prev);
    setUnreadCount(0);
    markAllNotificationsRead().catch(() => {});
  }

  async function onTogglePref(key: "marketingPushEnabled" | "marketingEmailEnabled", value: boolean) {
    setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
    try {
      await updateNotificationPreferences({ [key]: value });
    } catch {
      // Revert on failure — the switch must reflect what the server actually holds.
      setPrefs((prev) => (prev ? { ...prev, [key]: !value } : prev));
    }
  }

  if (!customer) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={[styles.header, { flexDirection: rowStart }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_forward" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <Pressable accessibilityRole="button" onPress={onMarkAllRead} hitSlop={8}>
              <Icon name="done_all" size={22} color={colors.primary} />
            </Pressable>
          )}
          {/* Replaces the empty 22-wide balance box this row fell back to when
              there was nothing to mark as read — same width either way, so
              the title stays centred. */}
          <MenuButton size={22} />
        </View>
      </View>

      <FlatList
        data={rows ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListHeaderComponent={
          prefs && (
            <View style={styles.prefsCard}>
              <View style={[styles.prefsHeader, { flexDirection: rowStart }]}>
                <Icon name="tune" size={18} color={colors.onSurfaceVariant} />
                <Text style={styles.prefsTitle}>العروض والاقتراحات</Text>
              </View>
              <Text style={styles.prefsSub}>
                تحديثات طلباتك ورسائلك بتوصلك دايمًا. ده بيتحكم بس في العروض والاقتراحات.
              </Text>
              <View style={[styles.prefRow, { flexDirection: rowStart }]}>
                <Text style={styles.prefLabel}>إشعارات على الموبايل</Text>
                <Switch
                  value={prefs.marketingPushEnabled}
                  onValueChange={(v) => onTogglePref("marketingPushEnabled", v)}
                  trackColor={{ true: colors.primary, false: colors.outlineVariant }}
                  thumbColor={colors.surfaceContainerLowest}
                />
              </View>
              <View style={[styles.prefRow, { flexDirection: rowStart }]}>
                <Text style={styles.prefLabel}>البريد الإلكتروني</Text>
                <Switch
                  value={prefs.marketingEmailEnabled}
                  onValueChange={(v) => onTogglePref("marketingEmailEnabled", v)}
                  trackColor={{ true: colors.primary, false: colors.outlineVariant }}
                  thumbColor={colors.surfaceContainerLowest}
                />
              </View>
            </View>
          )
        }
        renderItem={({ item }) => {
          const t = TYPE_STYLE[item.type];
          return (
            <Pressable
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                styles.row,
                { flexDirection: rowStart },
                !item.read && styles.rowUnread,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={[styles.iconCircle, { backgroundColor: t.bg }]}>
                <Icon name={t.icon} size={19} color={t.tint} />
              </View>
              <View style={styles.rowText}>
                <View style={[styles.rowTitleLine, { flexDirection: rowStart }]}>
                  <Text style={[styles.rowTitle, { textAlign: textStart }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.read && <View style={styles.dot} />}
                </View>
                <Text style={[styles.rowBody, { textAlign: textStart }]} numberOfLines={2}>
                  {item.body}
                </Text>
                <Text style={[styles.rowTime, { textAlign: textStart }]}>{formatNotificationTime(item.createdAt)}</Text>
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListEmptyComponent={
          rows !== null ? (
            <View style={styles.emptyWrap}>
              <Icon name="notifications_none" size={32} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش إشعارات لسه</Text>
              <Text style={styles.emptyBody}>أي تحديث على طلباتك أو رسايلك هيظهر هنا.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          error !== "" ? (
            <View style={styles.errorBanner}>
              <Icon name="error" size={15} color={colors.onErrorContainer} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  headerActions: { flexDirection: rowStart, alignItems: "center", gap: 14 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  listContent: { paddingBottom: 32 },

  prefsCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 4,
  },
  prefsHeader: { alignItems: "center", gap: 6 },
  prefsTitle: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant, letterSpacing: 0.2 },
  prefsSub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: colors.outline, textAlign: "right", lineHeight: 18, marginBottom: 8 },
  prefRow: { alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  prefLabel: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurface },

  row: { alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  rowUnread: { backgroundColor: "rgba(0, 85, 120, 0.035)" },
  rowPressed: { opacity: 0.7 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowTitleLine: { alignItems: "center", gap: 6 },
  rowTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  rowBody: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: colors.onSurfaceVariant, lineHeight: 19 },
  rowTime: { fontFamily: "Cairo_400Regular", fontSize: 12, color: colors.outline, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginHorizontal: 20 },

  emptyWrap: { alignItems: "center", gap: 8, paddingTop: 64, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface },
  emptyBody: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: colors.outline, textAlign: "center", lineHeight: 19 },

  errorBanner: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.errorContainer,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginTop: 8,
  },
  errorText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, color: colors.onErrorContainer },
});
