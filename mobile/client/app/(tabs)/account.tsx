import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Button from "../../components/Button";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import {
  customerLogout,
  deleteAccount,
  fetchSessions,
  revokeSessions,
  type CustomerSession,
} from "../../lib/customerAuth";
import { useRequireAccount } from "../../lib/authGate";
import { ApiError } from "@alassema/mobile-shared";

/**
 * The customer's account: profile, signed-in devices, and the way out — the
 * mobile counterpart of the website's Account.tsx (same three sections, same
 * copy where the copy is shared).
 *
 * The delete flow existing here at all is an Apple requirement, not a nice-to-
 * have: guideline 5.1.1(v) requires that an app letting you CREATE an account
 * also let you delete it from inside the app — a support email does not
 * satisfy a reviewer. Porting a screen that already worked on the website
 * means this is a port of proven logic, not something invented under review
 * pressure the week the app is submitted.
 */
export default function Account() {
  const customer = useRequireAccount("/account");
  const [sessions, setSessions] = useState<CustomerSession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");

  useEffect(() => {
    // Guest mid-redirect (see useRequireAccount) — nothing to fetch without
    // a session.
    if (!customer) return;
    fetchSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [customer]);

  async function onRevoke(sessionId?: string) {
    setBusy(true);
    setError("");
    try {
      await revokeSessions(sessionId);
      if (!sessionId) {
        // Revoking everywhere includes this device's own session — the access
        // token still works until it naturally expires, so sign out locally
        // too rather than leave a screen that looks authenticated and isn't.
        await customerLogout();
        router.replace("/sign-in");
        return;
      }
      setSessions(await fetchSessions());
    } catch {
      setError("حصلت مشكلة. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await customerLogout();
    router.replace("/sign-in");
  }

  async function onDelete() {
    setBusy(true);
    setError("");
    try {
      await deleteAccount(typedEmail);
      router.replace("/sign-in");
    } catch (err) {
      // The server only 400s for an actual email mismatch (see api's
      // /customer/delete route) — every other failure (timeout, offline, a
      // 500) used to show the same "you typed it wrong" message on an
      // IRREVERSIBLE action, telling someone they made a mistake they
      // didn't make.
      setError(
        err instanceof ApiError && err.status === 400
          ? "مش مطابق. اكتب بريدك الإلكتروني بالظبط."
          : "حصلت مشكلة ومقدرناش نمسح الحساب. جرّب تاني.",
      );
      setBusy(false);
    }
  }

  if (!customer) return null;

  const emailMatches = typedEmail.trim().toLowerCase() === customer.email.toLowerCase();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={sessions ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <View style={styles.topBarStart}>
                <Logo size={28} />
                <Text style={styles.title}>حسابك</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="بحث" onPress={() => router.push("/search")} hitSlop={8}>
                <Icon name="search" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            {error !== "" && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{customer.name.trim().charAt(0) || "?"}</Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.name}>{customer.name}</Text>
                <Text style={styles.email}>{customer.email}</Text>
              </View>
            </View>

            {/* المفضلة lost its tab slot in the five-tab redesign (see
                (tabs)/_layout.tsx) — this row and the heart button in the
                Search header are the two doors that replaced it. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/saved")}
              style={({ pressed }) => [styles.settingsRow, styles.settingsRowStacked, pressed && styles.settingsRowPressed]}
            >
              <Icon name="chevron_right" size={20} color={colors.outline} style={{ transform: [{ scaleX: -1 }] }} />
              <Text style={styles.settingsRowLabel}>المفضلة</Text>
              <Icon name="favorite" size={20} color={colors.onSurfaceVariant} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/notifications")}
              style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed]}
            >
              <Icon name="chevron_right" size={20} color={colors.outline} style={{ transform: [{ scaleX: -1 }] }} />
              <Text style={styles.settingsRowLabel}>الإشعارات</Text>
              <Icon name="notifications" size={20} color={colors.onSurfaceVariant} />
            </Pressable>

            <Text style={styles.sectionTitle}>الأجهزة المسجّل دخولها</Text>
            <Text style={styles.sectionSub}>أي جهاز هنا يقدر يفتح حسابك دلوقتي.</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.deviceRow}>
            <Icon name={item.platform === "ios" || item.platform === "android" ? "smartphone" : "computer"} color={colors.outline} />
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{item.deviceName || "جهاز غير معروف"}</Text>
              <Text style={styles.deviceMeta}>
                آخر استخدام {new Date(item.lastUsedAt).toLocaleDateString("ar-EG")}
              </Text>
            </View>
            <Text style={styles.revoke} onPress={() => onRevoke(item.id)}>
              تسجيل الخروج
            </Text>
          </View>
        )}
        ListEmptyComponent={
          sessions !== null ? <Text style={styles.emptyDevices}>مفيش أجهزة</Text> : null
        }
        ListFooterComponent={
          <>
            {sessions && sessions.length > 0 && (
              <Text style={styles.revokeAll} onPress={() => onRevoke()}>
                تسجيل الخروج من كل الأجهزة
              </Text>
            )}

            <View style={styles.linksRow}>
              <Text style={styles.link} onPress={() => router.push({ pathname: "/legal/[kind]", params: { kind: "terms" } })}>الشروط والأحكام</Text>
              <Text style={styles.link} onPress={() => router.push({ pathname: "/legal/[kind]", params: { kind: "privacy" } })}>سياسة الخصوصية</Text>
            </View>

            <Button label="تسجيل الخروج" variant="secondary" onPress={onSignOut} style={styles.signOutBtn} />

            <View style={styles.dangerCard}>
              <Text style={styles.dangerTitle}>حذف الحساب</Text>
              <Text style={styles.dangerBody}>
                ده بيشيل حسابك وطرق دخولك وكل الأجهزة المسجّلة. مش ممكن يترجع. الطلبات
                اللي بعتها قبل كده بتفضل عند الشركات اللي بعتها ليها — دي سجلّهم للشغل
                اللي عملوه.
              </Text>
              <Button
                label="حذف الحساب"
                variant="secondary"
                onPress={() => {
                  setTypedEmail("");
                  setError("");
                  setConfirmOpen(true);
                }}
                style={styles.dangerBtn}
              />
            </View>
          </>
        }
      />

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.dangerTitle}>حذف الحساب</Text>
            <Text style={styles.dangerBody}>{`اكتب بريدك الإلكتروني (${customer.email}) للتأكيد`}</Text>
            <TextInput
              value={typedEmail}
              onChangeText={setTypedEmail}
              autoCapitalize="none"
              textAlign="left"
              style={styles.confirmInput}
              placeholder={customer.email}
              placeholderTextColor={colors.outline}
            />
            <View style={styles.modalActions}>
              <Button
                label={busy ? "بيتحذف…" : "حذف نهائي"}
                onPress={onDelete}
                busy={busy}
                disabled={!emailMatches}
                style={styles.modalDeleteBtn}
              />
              <Button label="إلغاء" variant="secondary" onPress={() => setConfirmOpen(false)} disabled={busy} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: 20, gap: 10 },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "right",
  },
  topBar: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  topBarStart: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  errorBox: { backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onPrimary, fontFamily: "Cairo_700Bold", fontSize: type.title.fontSize },
  profileText: { flex: 1 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  email: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right", writingDirection: "ltr" },
  settingsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  // A row with another row directly under it: settingsRow's marginBottom is
  // the gap to the NEXT SECTION, which reads as a hole between two members of
  // one list.
  settingsRowStacked: { marginBottom: 10 },
  settingsRowPressed: { opacity: 0.7 },
  settingsRowLabel: { flex: 1, fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  sectionTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  sectionSub: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right", marginBottom: 8 },
  deviceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  deviceMeta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right" },
  revoke: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.error },
  emptyDevices: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "center", paddingVertical: 12 },
  revokeAll: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.error, textAlign: "center", marginTop: 4, marginBottom: 16 },
  linksRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 14, marginBottom: 20, marginTop: 4 },
  link: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.outline, textDecorationLine: "underline" },
  signOutBtn: { marginBottom: 24 },
  dangerCard: { borderWidth: 1, borderColor: `${colors.error}33`, borderRadius: 16, padding: 16, gap: 10 },
  dangerTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.error, textAlign: "right" },
  dangerBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 20 },
  dangerBtn: { alignSelf: "flex-start" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 20, padding: 20, gap: 12 },
  confirmInput: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    writingDirection: "ltr",
  },
  modalActions: { gap: 10, marginTop: 4 },
  modalDeleteBtn: { backgroundColor: colors.error },
});
