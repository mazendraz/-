import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCompany, ApiLead } from "@alassema/core";
import {
  DEFAULT_COUNTRY,
  DEFAULT_DIAL_CODE,
  DISTRICTS,
  colors,
  formatAsYouType,
  toE164,
  type,
} from "@alassema/core";
import Button from "../../components/Button";
import Icon from "../../components/Icon";
import TextField from "../../components/TextField";
import OfferingPicker, { type CartItem } from "../../components/OfferingPicker";
import Captcha from "../../components/Captcha";
import { submitLead } from "../../lib/leads";
import { fetchCompany } from "../../lib/companyDetail";
import { formatLeadEstimate } from "../../lib/pricing";
import { captchaConfigured } from "../../lib/captcha";
import { ApiError } from "../../lib/api";
import { useRequireAccount } from "../../lib/authGate";

/**
 * Submit a request to one company — a standalone route (outside the tab
 * group, like sign-in), so it pushes over the tab bar as a flow to complete
 * and leave, matching how /request behaves on the website.
 *
 * The classic single-service fields stay required regardless of whether the
 * company runs a priced catalog (Feature C): the server always needs SOME
 * `service` string on the payload, even though it overrides the STORED value
 * with the items' own names when `items` is present (see api's
 * leads.service.ts `create()`). When the company has published offerings,
 * OfferingPicker renders above the form and its selection rides along as
 * `items` — additive, never required.
 */
export default function NewRequest() {
  const { slug, name: companyName } = useLocalSearchParams<{ slug: string; name: string }>();
  const customer = useRequireAccount(`/new-request/${slug}`);

  const [name, setName] = useState(customer?.name ?? "");
  const [phoneNational, setPhoneNational] = useState("");
  const [district, setDistrict] = useState("");
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedLead, setSubmittedLead] = useState<ApiLead | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    fetchCompany(slug).then(setCompany).catch(() => setCompany(null));
  }, [slug]);

  const phoneE164 = toE164(phoneNational, DEFAULT_COUNTRY);
  const canSubmit =
    name.trim().length >= 2 && phoneE164 !== null && district !== "" && service.trim().length >= 2;

  async function onSubmit() {
    if (!canSubmit || !phoneE164) return;
    if (captchaConfigured() && !captchaToken) {
      setError("استنى ثانية لحد ما التحقق يخلص وبعدين جرّب تاني.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const lead = await submitLead({
        companySlug: slug,
        companyName: companyName ?? "",
        service: service.trim(),
        name: name.trim(),
        phone: phoneE164,
        district,
        description: description.trim(),
        items: cart.length > 0 ? cart.map((i) => ({ offeringId: i.offeringId, qty: i.qty, tierId: i.tierId })) : undefined,
        captchaToken,
      });
      setSubmittedLead(lead);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "تعذّر إرسال الطلب. جرّب تاني.",
      );
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!customer) return null;

  if (submittedLead) {
    const hasEstimate = (submittedLead.items?.length ?? 0) > 0;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successCard}>
          <Icon name="check_circle" size={40} color={colors.success} />
          <Text style={styles.successTitle}>اتبعت طلبك</Text>
          <Text style={styles.successBody}>
            {companyName} هتتواصل معاك قريب. رقم طلبك{" "}
            <Text style={styles.ref}>{submittedLead.refNumber}</Text>
          </Text>

          {hasEstimate && (
            <View style={styles.estimateCard}>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>الإجمالي التقديري</Text>
                <Text style={styles.estimateValue}>{formatLeadEstimate(submittedLead)}</Text>
              </View>
              {(submittedLead.discountPercent ?? 0) > 0 && (
                <Text style={styles.estimateNote}>
                  خصم الباقة {submittedLead.discountPercent}٪ (على البنود المسعّرة)
                </Text>
              )}
              {submittedLead.hasOnInspection && (
                <Text style={styles.estimateNote}>+ بنود تتحدد بعد المعاينة</Text>
              )}
              <Text style={styles.estimateFooter}>السعر النهائي بيتأكد مع الشركة</Text>
            </View>
          )}

          <Button
            label="طلباتي"
            onPress={() => router.replace("/requests")}
            style={styles.successBtn}
          />
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

          {company && company.offerings.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>اختار الخدمات اللي محتاجها (اختياري)</Text>
              <OfferingPicker
                offerings={company.offerings}
                bundleRules={company.bundleRules ?? []}
                value={cart}
                onChange={setCart}
              />
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

          <View style={styles.field}>
            <Text style={styles.label}>الحي</Text>
            <Pressable style={styles.districtButton} onPress={() => setDistrictPickerOpen(true)}>
              <Text style={district ? styles.districtValue : styles.districtPlaceholder}>
                {district || "اختر حيّك"}
              </Text>
            </Pressable>
          </View>

          <TextField
            label="الخدمة المطلوبة"
            value={service}
            onChangeText={setService}
            placeholder="مثال: تشطيب شقة، دهانات، تكييفات"
          />

          <View style={styles.field}>
            <Text style={styles.label}>تفاصيل الطلب (اختياري)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={styles.textArea}
              textAlign="right"
              placeholder="أي تفاصيل تساعد الشركة تفهم طلبك"
              placeholderTextColor={colors.outline}
            />
          </View>

          <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />

          <Button label="إرسال الطلب" onPress={onSubmit} busy={busy} disabled={!canSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={districtPickerOpen} transparent animationType="slide" onRequestClose={() => setDistrictPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDistrictPickerOpen(false)}>
          <View style={styles.sheet}>
            {DISTRICTS.map((d) => (
              <Pressable
                key={d}
                style={styles.sheetRow}
                onPress={() => {
                  setDistrict(d);
                  setDistrictPickerOpen(false);
                }}
              >
                <Text style={styles.sheetRowText}>{d}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, flex: 1, textAlign: "center" },
  scroll: { padding: 20, gap: 16 },
  errorBox: { backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  field: { gap: 6 },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant, textAlign: "right" },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainerLowest,
  },
  dialCode: {
    paddingHorizontal: 12,
    fontFamily: "Cairo_600SemiBold",
    fontSize: type.body.fontSize,
    color: colors.outline,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    writingDirection: "ltr",
  },
  districtButton: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surfaceContainerLowest,
  },
  districtValue: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  districtPlaceholder: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.outline, textAlign: "right" },
  textArea: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
    textAlignVertical: "top",
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 24 },
  sheetRow: { paddingHorizontal: 20, paddingVertical: 14 },
  sheetRowText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  successCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  successTitle: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface },
  successBody: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "center", lineHeight: 22 },
  ref: { fontFamily: "Cairo_700Bold", color: colors.primary, writingDirection: "ltr" },
  estimateCard: {
    alignSelf: "stretch",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    borderTopWidth: 3,
    borderTopColor: colors.primary,
    padding: 14,
    gap: 4,
  },
  estimateRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  estimateLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.outline },
  estimateValue: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.title.fontSize, color: colors.primary },
  estimateNote: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary, textAlign: "right" },
  estimateFooter: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  successBtn: { marginTop: 20, alignSelf: "stretch" },
});
