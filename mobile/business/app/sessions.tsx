import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchSessions, revokeAllSessions, revokeSessions, type StaffSession } from "../lib/staffAuth";
import Button from "../components/Button";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

/**
 * Task 13.3 — the devices/sessions screen phase 6 named (task 6.9, "sessions
 * list") but never built: fetchSessions/revokeSessions already existed in
 * lib/staffAuth.ts with no screen calling them. Shared by both roles (every
 * staff account can have multiple live sessions — see phase 0's
 * staffSession.service), so this lives at the top level, not under
 * (provider) or (admin), and MoreScreen links here for both.
 *
 * The API has no "except the caller" carve-out for ending every session at
 * once (see revokeAllSessions's own comment) — the list also has no marker
 * for which row is THIS device, since GET /auth/sessions returns none. Both
 * are server-side facts, not gaps to paper over client-side: the copy below
 * says so plainly instead of pretending a distinction the data doesn't carry.
 */
export default function Sessions() {
  const [sessions, setSessions] = useState<StaffSession[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchSessions();
      setSessions([...result].sort((a, b) => b.lastUsedAt - a.lastUsedAt));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الأجهزة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load());

  function endSession(session: StaffSession) {
    Alert.alert(
      "إنهاء الجلسة؟",
      `هيتم تسجيل الخروج من "${session.deviceName ?? "جهاز غير معروف"}". لو ده الجهاز اللي بتستخدمه دلوقتي، هتحتاج تسجّل دخول تاني.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إنهاء",
          style: "destructive",
          onPress: () => {
            setRevokingId(session.id);
            revokeSessions(session.id)
              .then(() => setSessions((prev) => prev?.filter((s) => s.id !== session.id) ?? prev))
              .catch((err) => Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إنهاء الجلسة."))
              .finally(() => setRevokingId(null));
          },
        },
      ],
    );
  }

  function endAllSessions() {
    Alert.alert(
      "إنهاء كل الجلسات؟",
      "هيتم تسجيل الخروج من كل الأجهزة، بما فيها الجهاز ده — مفيش استثناء. هتحتاج تسجّل دخول تاني على أي جهاز عايز تستخدمه.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إنهاء الكل",
          style: "destructive",
          onPress: () => {
            setRevokingAll(true);
            revokeAllSessions().catch((err) => {
              setRevokingAll(false);
              Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إنهاء الجلسات.");
            });
            // No navigation call on success: revokeAllSessions() clears
            // useStaffAuth().user, which fires app/index.tsx's <Redirect>
            // to /sign-in on the Stack's next render — same mechanism
            // MoreScreen's own signOut uses.
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "الأجهزة والجلسات" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : sessions && sessions.length > 0 ? (
          <>
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.deviceName}>{item.deviceName ?? "جهاز غير معروف"}</Text>
                    <Text style={styles.meta}>
                      {item.platform ?? "منصّة غير معروفة"} · آخر استخدام{" "}
                      {new Date(item.lastUsedAt).toLocaleString("ar-EG")}
                    </Text>
                  </View>
                  <Pressable style={styles.endBtn} disabled={revokingId === item.id} onPress={() => endSession(item)}>
                    <Text style={styles.endLabel}>{revokingId === item.id ? "..." : "إنهاء"}</Text>
                  </Pressable>
                </View>
              )}
            />
            <View style={styles.footer}>
              <Button label="إنهاء كل الجلسات" variant="danger" onPress={endAllSessions} busy={revokingAll} />
            </View>
          </>
        ) : (
          <EmptyCard title="مفيش أجهزة مسجّلة" />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  separator: { height: 10 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  rowInfo: { flex: 1, gap: 2 },
  deviceName: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  meta: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  endBtn: {
    backgroundColor: colors.errorContainer,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  endLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onErrorContainer },
  footer: { padding: 16, paddingTop: 0 },
});
