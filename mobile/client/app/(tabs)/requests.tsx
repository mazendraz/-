import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiLead } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import StatusPill from "../../components/StatusPill";
import { router } from "expo-router";
import { fetchAccountLeads } from "../../lib/customerLeads";
import { useLiveEvents } from "../../lib/liveEvents";
import ReviewModal from "../../components/ReviewModal";
import { ApiError } from "../../lib/api";

/**
 * "My Requests" — real data from the account, replacing the placeholder that
 * stood in for this while sign-in was being built.
 *
 * No offline cache, no optimistic list the way the website's requests.ts
 * keeps one: that cache exists there to serve a device with NO account (the
 * pre-signup era, and the localStorage handover still documented in
 * customerLeads.ts). Every screen past sign-in in this app assumes a signed-in
 * account, so the server response IS the source of truth — server-sorted,
 * server-filtered, nothing to reconcile.
 */
export default function Requests() {
  const [leads, setLeads] = useState<ApiLead[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [reviewing, setReviewing] = useState<{ id: string; companyName: string } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      setLeads(await fetchAccountLeads());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "تعذّر تحميل طلباتك. اسحب لتحديث الصفحة.",
      );
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // "lead" fires on a new request, "lead-status" and "message" on updates to
  // an existing one (a status change, or a reply worth surfacing via the list
  // sort order) — all three are simplest handled the same way: refetch. The
  // payload only ever carries IDs (see api's realtime.service.ts), so there is
  // no partial-update path that would save more than this costs.
  useLiveEvents(() => load());

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>طلباتي</Text>

      <FlatList
        data={leads ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          leads === null ? null : (
            <View style={styles.empty}>
              <Icon name="receipt_long" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش طلبات لسه</Text>
              <Text style={styles.emptyBody}>أول طلب تبعته هيظهر هنا.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.company} numberOfLines={1}>{item.companyName}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.service} numberOfLines={1}>{item.service}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.ref}>{item.refNumber}</Text>
              <Text style={styles.district}>{item.district}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                style={styles.actionBtn}
                onPress={() =>
                  router.push({
                    pathname: "/chat/[leadId]",
                    params: { leadId: item.id, companyName: item.companyName },
                  })
                }
              >
                <Icon name="forum" size={16} color={colors.primary} />
                <Text style={styles.actionText}>المحادثة</Text>
              </Pressable>
              {item.status === "Completed" && !item.reviewed && (
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => setReviewing({ id: item.id, companyName: item.companyName })}
                >
                  <Icon name="favorite" size={16} color={colors.primary} />
                  <Text style={styles.actionText}>قيّم الخدمة</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />

      {error !== "" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {reviewing && (
        <ReviewModal
          visible
          leadId={reviewing.id}
          companyName={reviewing.companyName}
          onClose={() => setReviewing(null)}
          onSubmitted={() => {
            setReviewing(null);
            load();
          }}
        />
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
  listContent: { padding: 20, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, flexShrink: 1, textAlign: "right" },
  service: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right" },
  cardFooter: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 4 },
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  actionBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  actionText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.primary },
  ref: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.outline, writingDirection: "ltr" },
  district: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  empty: { alignItems: "center", gap: 6, paddingTop: 80 },
  emptyTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  emptyBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
});
