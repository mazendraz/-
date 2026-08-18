import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiThreadSummary } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchAccountLeads } from "../../lib/customerLeads";
import { fetchThreadSummaries } from "../../lib/chat";
import { useLiveEvents } from "../../lib/liveEvents";
import { ApiError } from "../../lib/api";
import { useRequireAccount } from "../../lib/authGate";

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

  const rows: Row[] = useMemo(() => {
    return (summaries ?? [])
      .map((summary) => {
        const leadId = refByLeadId.get(summary.refNumber);
        return leadId ? { leadId, summary } : null;
      })
      .filter((r): r is Row => r !== null);
  }, [summaries, refByLeadId]);

  if (!customer) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>الرسائل</Text>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.leadId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListEmptyComponent={
          summaries === null ? null : (
            <View style={styles.empty}>
              <Icon name="forum" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش محادثات لسه</Text>
              <Text style={styles.emptyBody}>لما تبعت طلب، تقدر تتواصل مع الشركة من هنا.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: "/chat/[leadId]",
                params: { leadId: item.leadId, companyName: item.summary.companyName },
              })
            }
          >
            <View style={styles.avatar}>
              <Icon name="forum" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <View style={styles.rowHeader}>
                <Text style={styles.company} numberOfLines={1}>{item.summary.companyName}</Text>
                {item.summary.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.summary.unread}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.preview, item.summary.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                {item.summary.lastMessagePreview || "ابدأ المحادثة"}
              </Text>
            </View>
          </Pressable>
        )}
      />

      {error !== "" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "right",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  listContent: { padding: 20, gap: 10, flexGrow: 1 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryContainer, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  company: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, flexShrink: 1, textAlign: "right" },
  preview: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: "right" },
  previewUnread: { color: colors.onSurface, fontFamily: "Cairo_600SemiBold" },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { color: colors.onPrimary, fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize },
  empty: { alignItems: "center", gap: 6, paddingTop: 80 },
  emptyTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  emptyBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "center" },
  errorBanner: { backgroundColor: colors.errorContainer, marginHorizontal: 20, marginBottom: 12, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
});
