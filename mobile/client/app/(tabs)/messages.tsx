import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiThreadSummary } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import { fetchAccountLeads } from "../../lib/customerLeads";
import { fetchThreadSummaries } from "../../lib/chat";
import { useLiveEvents } from "../../lib/liveEvents";
import { ApiError } from "../../lib/api";
import { useRequireAccount } from "../../lib/authGate";
import { rowStart, textStart, uiIsRTL } from "../../lib/rtl";

interface Row {
  leadId: string;
  summary: ApiThreadSummary;
}

/**
 * The dedicated conversations list — the mobile counterpart of the website's
 * Messages.tsx. `GET /customer/chat/summaries` (account-based, built and
 * live-tested in an earlier backend pass) returns one line per thread keyed
 * by refNumber, not lead id; chat/[leadId].tsx needs the lead id to open a
 * thread, so this screen cross-references against fetchAccountLeads() the
 * same way the website matches its local lead cache against `threads` by
 * refNumber.
 *
 * ── Layout direction ────────────────────────────────────────────────────────
 * Every row takes its `flexDirection` from `rowStart` and every block of text
 * its alignment from `textStart` (lib/rtl.ts) rather than the hardcoded
 * `row-reverse` + `textAlign: "right"` pair used elsewhere in this app. That
 * pair only reads as RTL while the LAYOUT ENGINE is LTR — true in a browser,
 * false on a phone once forceRTL has taken effect, because Yoga swaps row and
 * row-reverse under an RTL engine. `rowStart` resolves to whichever of the two
 * genuinely runs start-to-end in the engine that is actually running, so this
 * screen reads right in Expo web AND on a device, and follows the locale
 * rather than being re-mirrored by hand when English lands.
 */
export default function Messages() {
  const customer = useRequireAccount("/messages");
  const [summaries, setSummaries] = useState<ApiThreadSummary[] | null>(null);
  const [refByLeadId, setRefByLeadId] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    // Guest mid-redirect (see useRequireAccount) — these are account-scoped
    // endpoints, nothing to fetch without a session.
    if (!customer) return;
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const [leads, s] = await Promise.all([fetchAccountLeads(), fetchThreadSummaries()]);
      setRefByLeadId(new Map(leads.map((l) => [l.refNumber, l.id])));
      setSummaries(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المحادثات.");
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, [customer]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type === "message") load();
  });

  // Fallback for the live stream reconnecting or having silently never
  // delivered an event this session — see requests.tsx's identical interval
  // for the full reasoning.
  useEffect(() => {
    const id = setInterval(() => load(), 45_000);
    return () => clearInterval(id);
  }, [load]);

  const rows: Row[] = useMemo(() => {
    return (summaries ?? [])
      .map((summary) => {
        const leadId = refByLeadId.get(summary.refNumber);
        return leadId ? { leadId, summary } : null;
      })
      .filter((r): r is Row => r !== null);
  }, [summaries, refByLeadId]);

  if (!customer) return null;

  // First load only: a refresh keeps the list on screen instead of replacing
  // it with placeholder rows.
  const loading = summaries === null && error === "";
  // A failed FIRST load has nothing to show behind a banner, so it takes over
  // the list area; a failure with rows already on screen must not throw the
  // conversations away, so that one stays a slim banner above them.
  const errorTakesOver = error !== "" && rows.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Compact bar: the mark stays centred because both side slots are the
          same fixed width — an absolutely-positioned logo would sit over the
          search button's touch target instead of beside it. */}
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="بحث"
            onPress={() => router.push("/search")}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Icon name="search" size={21} color={colors.onSurface} />
          </Pressable>
        </View>
        <Logo size={26} />
        <View style={styles.headerSide} />
      </View>

      <Text style={styles.title}>الرسائل</Text>

      {loading ? (
        <View style={[styles.listContent, styles.card]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i}>
              {i > 0 && <View style={styles.divider} />}
              <SkeletonRow />
            </View>
          ))}
        </View>
      ) : errorTakesOver ? (
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, styles.stateIconError]}>
            <Icon name="error" size={26} color={colors.error} />
          </View>
          <Text style={styles.stateTitle}>تعذّر تحميل المحادثات</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => load(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
          >
            <Icon name="refresh" size={16} color={colors.primary} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {error !== "" && (
            <View style={styles.errorBanner}>
              <Icon name="error" size={15} color={colors.onErrorContainer} />
              <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            </View>
          )}

          <FlatList
            data={rows}
            keyExtractor={(row) => row.leadId}
            contentContainerStyle={[
              styles.listContent,
              // The white sheet only exists where there are rows to sit on it;
              // an empty list must not paint a full-height blank card.
              rows.length > 0 ? styles.card : styles.listGrow,
            ]}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
            }
            ListEmptyComponent={
              <View style={styles.stateWrap}>
                <View style={styles.stateIcon}>
                  <Icon name="forum" size={26} color={colors.primary} />
                </View>
                <Text style={styles.stateTitle}>لا توجد رسائل بعد</Text>
                <Text style={styles.stateBody}>لما تبعت طلب، تقدر تتواصل مع الشركة من هنا.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <ConversationRow
                summary={item.summary}
                onPress={() =>
                  router.push({
                    pathname: "/chat/[leadId]",
                    params: { leadId: item.leadId, companyName: item.summary.companyName },
                  })
                }
              />
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * One inbox row: avatar, who it's with, what was last said, when — with the
 * unread state carried by weight and a badge rather than a differently-shaped
 * row, so a list of twenty still scans as one column.
 */
function ConversationRow({ summary, onPress }: { summary: ApiThreadSummary; onPress: () => void }) {
  const unread = summary.unread > 0;
  const mine = summary.lastMessageSender === "CUSTOMER";
  const initial = summary.companyName.trim().charAt(0).toUpperCase() || "؟";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? `${summary.companyName} — ${summary.unread} رسالة غير مقروءة`
          : summary.companyName
      }
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]}
    >
      <View style={[styles.avatar, unread && styles.avatarUnread]}>
        <Text style={[styles.avatarText, unread && styles.avatarTextUnread]} numberOfLines={1}>
          {initial}
        </Text>
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowLine}>
          {/* flex:1 on the name and flexShrink:0 on the meta is what keeps a
              very long company name from pushing the timestamp off the row —
              it truncates instead. */}
          <Text style={[styles.company, unread && styles.companyUnread]} numberOfLines={1}>
            {summary.companyName}
          </Text>
          <View style={styles.rowMeta}>
            {summary.closed && <Icon name="lock" size={13} color={colors.outline} />}
            {summary.lastMessageAt !== null && (
              <Text style={[styles.time, unread && styles.timeUnread]} numberOfLines={1}>
                {formatThreadTime(summary.lastMessageAt)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rowLine}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {summary.lastMessagePreview
              ? `${mine ? "أنت: " : ""}${summary.lastMessagePreview}`
              : "ابدأ المحادثة"}
          </Text>
          {unread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText} numberOfLines={1}>{summary.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Placeholder row for the first load — plain blocks, no shimmer. */
function SkeletonRow() {
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, styles.skeleton]} />
      <View style={styles.rowBody}>
        <View style={[styles.skeleton, styles.skeletonLine, { width: "45%" }]} />
        <View style={[styles.skeleton, styles.skeletonLine, { width: "72%", marginTop: 8 }]} />
      </View>
    </View>
  );
}

const DAY_MS = 86_400_000;

/**
 * Inbox-style timestamp: the time for today, "أمس" for yesterday, the weekday
 * within the last week, then a short date. Latin digits ("-u-nu-latn") to match
 * the numerals the rest of the app formats with (see lib/pricing.ts).
 */
function formatThreadTime(ts: number): string {
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

// Alpha tints of colors.primary. The token set (packages/core/theme.ts) is
// opaque-only, and these are the same "primary at 4–10%" washes the website
// gets from Tailwind's `bg-primary/8` — kept as literals here rather than
// invented colors.
const PRIMARY_TINT = "rgba(0, 85, 120, 0.08)";
const PRIMARY_TINT_ROW = "rgba(0, 85, 120, 0.045)";
const PRIMARY_TINT_PRESSED = "rgba(0, 85, 120, 0.09)";
// One step lighter than colors.outlineVariant (#bfc7cf), which reads as a hard
// outline when it repeats down a list of dividers.
const HAIRLINE = colors.surfaceContainerHigh;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  /** Equal fixed slots on both sides so the logo lands on the true centre. */
  headerSide: { width: 40, alignItems: "center" },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerBtnPressed: { backgroundColor: colors.surfaceContainer },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },

  // ── List sheet ────────────────────────────────────────────────────────────
  listContent: { paddingBottom: 24 },
  listGrow: { flexGrow: 1 },
  card: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingBottom: 0,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: HAIRLINE,
    // Starts past the avatar column (16 padding + 42 avatar + 12 gap) so the
    // rows read as one grouped sheet, not as separate slabs. Physical side,
    // not marginStart: the logical props resolve against the ENGINE's
    // direction, which is LTR on web even though this UI is not.
    ...(uiIsRTL ? { marginRight: 70 } : { marginLeft: 70 }),
  },

  // ── Row ───────────────────────────────────────────────────────────────────
  row: { flexDirection: rowStart, alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowUnread: { backgroundColor: PRIMARY_TINT_ROW },
  rowPressed: { backgroundColor: PRIMARY_TINT_PRESSED },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUnread: { backgroundColor: colors.primary },
  avatarText: { fontFamily: "Alexandria_700Bold", fontSize: type.body.fontSize, color: colors.primary },
  avatarTextUnread: { color: colors.onPrimary },

  rowBody: { flex: 1, gap: 3 },
  rowLine: { flexDirection: rowStart, alignItems: "center", gap: 8 },
  company: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: textStart },
  companyUnread: { fontFamily: "Cairo_700Bold" },
  rowMeta: { flexDirection: rowStart, alignItems: "center", gap: 4, flexShrink: 0 },
  time: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },
  timeUnread: { fontFamily: "Cairo_600SemiBold", color: colors.primary },
  preview: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: textStart },
  previewUnread: { fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  unreadText: { color: colors.onPrimary, fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize },

  // ── Empty / error ─────────────────────────────────────────────────────────
  stateWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40, paddingBottom: 48 },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateIconError: { backgroundColor: colors.errorContainer },
  stateTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "center" },
  stateBody: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight + 4,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: PRIMARY_TINT,
  },
  retryBtnPressed: { backgroundColor: PRIMARY_TINT_PRESSED },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },

  errorBanner: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.errorContainer,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { flex: 1, fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: textStart },

  // ── Skeleton ──────────────────────────────────────────────────────────────
  skeleton: { backgroundColor: colors.surfaceContainerHigh },
  skeletonLine: { height: 11, borderRadius: 6 },
});
