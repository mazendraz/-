import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { DEFAULT_COUNTRY, DEFAULT_DIAL_CODE, colors, formatAsYouType, toE164, type } from "@alassema/core";
import Button from "../../../components/Button";
import Icon from "../../../components/Icon";
import TextField from "../../../components/TextField";
import { useCustomerAuth } from "../../../lib/customerAuth";
import { joinWaitlist } from "../../../lib/companyDetail";
import { ApiError } from "../../../lib/api";

/**
 * Join the waiting list for a currently-busy company — the mobile
 * counterpart of the "Join waiting list" CTA the website's CompanyProfile
 * swaps in for "Request Service" while a company is busy. Reached only from
 * the busy branch of company/[slug]'s footer button.
 */
export default function JoinWaitlist() {
  const { slug, name: companyName } = useLocalSearchParams<{ slug: string; name: string }>();
  const { customer } = useCustomerAuth();

  const [name, setName] = useState(customer?.name ?? "");
  const [phoneNational, setPhoneNational] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);

  const phoneE164 = toE164(phoneNational, DEFAULT_COUNTRY);
  const canSubmit = name.trim().length >= 2 && phoneE164 !== null;

  async function onSubmit() {
    if (!canSubmit || !phoneE164) return;
    setBusy(true);
    setError("");
    try {
      await joinWaitlist(slug, { name: name.trim(), phone: phoneE164, note: note.trim() || undefined });
      setJoined(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الانضمام. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successCard}>
          <Icon name="check_circle" size={40} color={colors.success} />
          <Text style={styles.successTitle}>اتضفت لقائمة الانتظار</Text>
          <Text style={styles.successBody}>{companyName} هتكلّمك أول ما تفضى.</Text>
          <Button label="رجوع للشركات" onPress={() => router.replace("/companies")} style={styles.successBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{companyName}</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error !== "" && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextField label="اسمك" value={name} onChangeText={setName} />

          <View style={styles.field}>
            <Text style={styles.label}>رقم الموبايل</Text>
            <View style={styles.phoneRow}>
              <Text style={styles.dialCode}>{DEFAULT_DIAL_CODE}</Text>
              <TextInput
                value={phoneNational}
                onChangeText={(t) => setPhoneNational(formatAsYouType(t, DEFAULT_COUNTRY))}
                keyboardType="phone-pad"
                placeholder="1XX XXX XXXX"
                placeholderTextColor={colors.outline}
                style={styles.phoneInput}
                textAlign="left"
              />
            </View>
          </View>

          <TextField label="ملاحظة (اختياري)" value={note} onChangeText={setNote} placeholder="أي حاجة تحب تقولها" />

          <Button label="انضم لقائمة الانتظار" onPress={onSubmit} busy={busy} disabled={!canSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, flex: 1, textAlign: "center" },
  scroll: { padding: 20, gap: 16 },
  errorBox: { backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  field: { gap: 6 },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant, textAlign: "right" },
  phoneRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, backgroundColor: colors.surfaceContainerLowest },
  dialCode: { paddingHorizontal: 12, fontFamily: "Cairo_600SemiBold", fontSize: type.body.fontSize, color: colors.outline, borderRightWidth: 1, borderRightColor: colors.outlineVariant },
  phoneInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurface, writingDirection: "ltr" },
  successCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  successTitle: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface },
  successBody: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "center" },
  successBtn: { marginTop: 20, alignSelf: "stretch" },
});
