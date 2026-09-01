import { useCallback, useEffect, useRef, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { ApiCompany, ApiLead, ApiWaitlistEntry } from "@alassema/core";
import {
  DEFAULT_COUNTRY,
  DEFAULT_DIAL_CODE,
  DISTRICTS,
  colors,
  formatAsYouType,
  parseExisting,
  toE164,
  type,
} from "@alassema/core";
import Button from "../../components/Button";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import TextField from "../../components/TextField";
import OfferingPicker, { type CartItem } from "../../components/OfferingPicker";
import Captcha from "../../components/Captcha";
import { submitLead } from "../../lib/leads";
import { fetchAccountLeads } from "../../lib/customerLeads";
import { fetchCompany, joinWaitlist } from "../../lib/companyDetail";
import { formatLeadEstimate } from "../../lib/pricing";
import { captchaConfigured } from "../../lib/captcha";
import { ApiError, parseLines, useSettings, rowStart, rowLtr } from "@alassema/mobile-shared";
import { useRequireAccount } from "../../lib/authGate";

/**
 * Submit a request to one company — a standalone route (outside the tab
 * group, like sign-in), so it pushes over the tab bar as a flow to complete
 * and leave, matching how /request behaves on the website.
 *
 * ── How the "service" field works (mirrors the website's RequestForm.tsx) ────
 * `service` is OPTIONAL and is never typed by hand. Exactly like the website:
 *   • company has priced offerings → OfferingPicker, and nothing else;
 *   • else it has a `services` list → a picker over THAT list, optional;
 *   • else → no service control at all.
 * An empty value is sent as "General Inquiry" (the same literal the website
 * submits), because the API's payload shape still requires some string even
 * though it overwrites the STORED value with the items' own names whenever
 * `items` is present — see api's leads.service.ts `create()`.
 *
 * This screen used to render a free-text box instead, which had no counterpart
 * on the website and made the field mandatory: a customer picking from a full
 * priced catalog was still forced to describe that same service again in prose
 * before the button would enable.
 *
 * Visual redesign (2026-08-22): marketplace-style layout — a minimal app
 * header, a company-context block, selectable service cards, a proper order
 * summary, and a sectioned customer form under a sticky CTA. None of the
 * state, validation, or submit logic above changed; only how it's presented.
 */
export default function NewRequest() {
  const { slug, name: companyName, offeringId } = useLocalSearchParams<{ slug: string; name: string; offeringId?: string }>();
  const customer = useRequireAccount(`/new-request/${slug}`);
  const insets = useSafeAreaInsets();

  // Admin-configurable district list (Settings → districts), falling back to
  // the built-in DISTRICTS — same override rule as the website's
  // RequestForm.tsx (`parseLines(settings.districts, DISTRICTS)`). Previously
  // this screen only ever showed the hardcoded built-in list, so an admin
  // editing the district list from the dashboard had no effect here.
  const settings = useSettings();
  const districts = parseLines(settings.districts, DISTRICTS);

  const [name, setName] = useState(customer?.name ?? "");
  const [phoneNational, setPhoneNational] = useState("");
  const [district, setDistrict] = useState("");
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Smart pre-fill: reuse phone + district from the account's last request ──
  //
  // The website's counterpart (RequestForm.tsx) reads this instantly off
  // localStorage — no account there, so "last request" IS the device's own
  // history, sitting in memory before the form ever renders. This app has no
  // such local history (every customer is signed in — see useRequireAccount
  // above), so the equivalent fact lives on the server: the account's most
  // recent lead, fetched the same way the Requests tab already does
  // (fetchAccountLeads, newest first).
  //
  // Name is intentionally NOT part of this: it already comes from the
  // account (customer.name, set above) — a more reliable source than
  // whatever was typed on a past order, and one that needs no network call.
  const [prefilled, setPrefilled] = useState(false);
  // Guards against overwriting something the customer already typed while the
  // fetch was still in flight — a real window on a slow connection, not a
  // theoretical one. Set by the phone/district change handlers below.
  const contactTouched = useRef(false);
  useEffect(() => {
    if (!customer) return;
    let active = true;
    fetchAccountLeads()
      .then((leads) => {
        const last = leads[0];
        if (!active || !last || contactTouched.current) return;
        setPhoneNational(parseExisting(last.phone, DEFAULT_COUNTRY).national);
        setDistrict(last.district);
        setPrefilled(true);
      })
      .catch(() => {
        // No last request, signed out mid-fetch, or offline — the form just
        // starts blank, same as it always did before this existed.
      });
    return () => {
      active = false;
    };
  }, [customer]);

  function clearPrefill() {
    contactTouched.current = true;
    setPhoneNational("");
    setDistrict("");
    setPrefilled(false);
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /**
   * What the submission produced. Two shapes, because a company that is booked
   * out queues the request instead of taking it: `lead` is the usual ApiLead
   * (reference number, chat, tracking), `queued` is the waiting-list entry the
   * SAME form produced. Discriminated rather than two pieces of state so
   * "submitted" can only ever mean one of them.
   */
  const [submitted, setSubmitted] = useState<
    | { kind: "lead"; lead: ApiLead }
    | { kind: "queued"; entry: ApiWaitlistEntry }
    | null
  >(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    fetchCompany(slug).then(setCompany).catch(() => setCompany(null));
  }, [slug]);

  // "أضف للطلب" on the company profile links here with ?offeringId=... — land
  // with that offering already checked in the picker below, instead of an
  // empty list the customer has to re-find it in. Runs once company data
  // (needed for minQty) is in; guarded so it doesn't re-add on every refetch.
  const [preselected, setPreselected] = useState(false);
  useEffect(() => {
    if (preselected || !company || !offeringId) return;
    const offering = company.offerings.find((o) => o.id === offeringId);
    if (offering) setCart((prev) => (prev.some((i) => i.offeringId === offeringId) ? prev : [...prev, { offeringId, qty: offering.minQty ?? 1, tierId: null }]));
    setPreselected(true);
  }, [company, offeringId, preselected]);

  // ── Reset the per-order state whenever the customer leaves this screen ─────
  //
  // `submitted` is what makes this screen render the confirmation card
  // instead of the form, and nothing ever cleared it. That is only safe while
  // every visit gets a FRESH component — which a plain router.push() does.
  // It doesn't always: react-navigation re-focuses an instance it still has
  // rather than building a new one, and then the old state comes back with
  // it. Reported 2026-08-25 after a real order: from then on, every
  // "اطلب الخدمة" opened straight onto the PREVIOUS order's
  // confirmation — no form, no way to send a second request. `preselected`
  // had the same bug more quietly: a later visit carrying a different
  // ?offeringId= never pre-checked it.
  //
  // Rather than depend on which navigation action ran, make the stale state
  // impossible: an order belongs to one visit, so it dies with that visit.
  // Cleared on BLUR rather than on focus so the old card is already gone
  // before the screen is shown again (no flash of the previous order).
  //
  // Deliberately NOT cleared: name / phone / district. Those describe the
  // customer, not this order — they come from the account and from the smart
  // pre-fill above, and re-typing them for every request is exactly what that
  // pre-fill exists to avoid.
  useFocusEffect(
    useCallback(() => {
      // Arriving: release the ?offeringId= effect above so it applies THIS
      // visit's param into the (now empty) cart.
      setPreselected(false);
      return () => {
        setSubmitted(null);
        setCart([]);
        setService("");
        setDescription("");
        setError("");
        // Parked, not released: the effect above must not fire while the
        // screen sits off-screen and put the offering we just cleared back
        // into the cart. The line above releases it again on the way in.
        setPreselected(true);
        // Turnstile tokens are single-use — the next order needs a fresh one.
        setCaptchaToken(null);
        setCaptchaReset((n) => n + 1);
      };
    }, []),
  );

  const phoneE164 = toE164(phoneNational, DEFAULT_COUNTRY);
  // `service` is deliberately absent from this check — see the module comment.
  // The website requires exactly these three and nothing else.
  const canSubmit = name.trim().length >= 2 && phoneE164 !== null && district !== "";

  // Is this company booked out right now? The ONE thing it changes about this
  // screen: the finished request is queued on their waiting list instead of
  // landing as a lead. Same fields, same validation, same account gate — and
  // the entry becomes a real Lead, verbatim, when the provider accepts it.
  //
  // False until the profile loads (the fetch above), and an unloaded company is
  // not a busy one — a request that lands as a lead a second after a provider
  // went busy is the same harmless race the website has always accepted.
  const companyBusy = company?.busy === true;

  async function onSubmit() {
    if (!canSubmit || !phoneE164) return;
    if (captchaConfigured() && !captchaToken) {
      setError("استنى لحد ما التحقق يخلص. لو فضل واقف، اضغط «أعد المحاولة» تحت.");
      return;
    }
    setBusy(true);
    setError("");
    // One payload for both destinations: a request to a busy company is the
    // same request, so anything added to this form reaches the waiting list too
    // without a second place to remember.
    const items = cart.length > 0
      ? cart.map((i) => ({ offeringId: i.offeringId, qty: i.qty, tierId: i.tierId }))
      : undefined;
    // Same fallback literal the website sends (RequestForm.tsx) — the payload
    // needs a string even when no service was picked.
    const serviceText = service.trim() || "General Inquiry";
    try {
      if (companyBusy) {
        const entry = await joinWaitlist(slug, {
          name: name.trim(),
          phone: phoneE164,
          service: serviceText,
          // The waiting list stores the job description in `note`.
          note: description.trim(),
          district,
          items,
          captchaToken,
        });
        setSubmitted({ kind: "queued", entry });
      } else {
        const lead = await submitLead({
          companySlug: slug,
          companyName: companyName ?? "",
          service: serviceText,
          name: name.trim(),
          phone: phoneE164,
          district,
          description: description.trim(),
          items,
          captchaToken,
        });
        setSubmitted({ kind: "lead", lead });
      }
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

  if (submitted) {
    // Both shapes carry the same priced basket, so the estimate card below reads
    // from whichever one this is without caring which — a queued request shows
    // the customer the same total they will still be quoted after the provider
    // accepts it (the estimate is frozen at submit time either way).
    const order = submitted.kind === "lead" ? submitted.lead : submitted.entry;
    const hasEstimate = (order.items?.length ?? 0) > 0;
    const queued = submitted.kind === "queued";
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successCard}>
          <Icon
            name={queued ? "hourglass_top" : "check_circle"}
            size={40}
            color={queued ? colors.warning : colors.success}
          />
          <Text style={styles.successTitle}>{queued ? "تم حجز دورك" : "اتبعت طلبك"}</Text>
          {queued ? (
            <Text style={styles.successBody}>
              {companyName} مشغولة دلوقتي. طلبك اتسجّل كامل بكل التفاصيل والسعر،
              وهيتحوّل لطلب عادي برقم مرجعي أول ما يقبلوه.
            </Text>
          ) : (
            <Text style={styles.successBody}>
              {companyName} هتتواصل معاك قريب. رقم طلبك{" "}
              <Text style={styles.ref}>{submitted.lead.refNumber}</Text>
            </Text>
          )}

          {hasEstimate && (
            <View style={styles.estimateCard}>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>الإجمالي التقديري</Text>
                <Text style={styles.estimateValue}>{formatLeadEstimate(order)}</Text>
              </View>
              {(order.discountPercent ?? 0) > 0 && (
                <Text style={styles.estimateNote}>
                  خصم الباقة {order.discountPercent}٪ (على البنود المسعّرة)
                </Text>
              )}
              {order.hasOnInspection && (
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

  const hasCatalog = !!company && company.offerings.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Minimal app-brand header — the page's own context (company name,
          what this screen is for) lives below in `contextBlock`, not here.
          Kept OUTSIDE the ScrollView, same static-header pattern the rest of
          this app's standalone flows use, so it never moves while scrolling. */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Icon name="arrow_forward" size={22} color={colors.onSurface} />
        </Pressable>
        <Logo size={26} />
        {/* Balances the back button so the logo is optically centered. */}
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contextBlock}>
            <Text style={styles.contextCompany} numberOfLines={1}>{companyName}</Text>
            <Text style={styles.contextSubtitle}>
              {hasCatalog ? "اختر الخدمات التي تريد طلبها (اختياري)" : "أدخل بيانات طلبك في الخطوات التالية"}
            </Text>
          </View>

          {/* Booked-out notice. This screen used to be unreachable for a busy
              company — the profile sent the customer to a separate, shorter
              "leave your name and number" screen instead, so a busy company
              collected a callback slip rather than the request the customer
              came to make. Now the form is the same one either way and this
              only sets the expectation: it is going in, it waits its turn. */}
          {companyBusy && (
            <View style={styles.busyBox}>
              <Icon name="event_busy" size={18} color={colors.onWarningContainer} />
              <Text style={styles.busyText}>
                {companyName} محجوزة بالكامل دلوقتي. اطلب عادي — طلبك بيتسجّل كامل
                وبياخد دوره، وهيبدأوا معاك أول ما يفضوا.
              </Text>
            </View>
          )}

          {error !== "" && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Priced catalog, else the plain services list, else nothing —
              the same three-way choice the website's RequestForm.tsx makes
              for its single "الخدمة المطلوبة" slot. */}
          {hasCatalog && company ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>الخدمات المتاحة</Text>
              <OfferingPicker
                offerings={company.offerings}
                bundleRules={company.bundleRules ?? []}
                value={cart}
                onChange={setCart}
              />
            </View>
          ) : company && company.services.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>الخدمة المطلوبة</Text>
              <Pressable style={styles.districtButton} onPress={() => setServicePickerOpen(true)}>
                <Text style={service ? styles.districtValue : styles.districtPlaceholder}>
                  {service || "اختر خدمة (اختياري)"}
                </Text>
                <Icon name="expand_more" size={20} color={colors.outline} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>بيانات العميل</Text>

            {prefilled && (
              <View style={styles.prefillBox}>
                <Icon name="history" size={18} color={colors.onSuccessContainer} />
                <Text style={styles.prefillText}>ملأنا رقمك وحيّك من طلبك السابق</Text>
                <Pressable onPress={clearPrefill} hitSlop={8}>
                  <Text style={styles.prefillClear}>مسح</Text>
                </Pressable>
              </View>
            )}

            <TextField label="الاسم" value={name} onChangeText={setName} />

            <View style={styles.field}>
              <Text style={styles.label}>رقم الموبايل</Text>
              <View style={styles.phoneRow}>
                <Text style={styles.dialCode}>{DEFAULT_DIAL_CODE}</Text>
                <TextInput
                  value={phoneNational}
                  onChangeText={(t) => {
                    contactTouched.current = true;
                    setPhoneNational(formatAsYouType(t, DEFAULT_COUNTRY));
                  }}
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
                <Icon name="expand_more" size={20} color={colors.outline} />
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>تفاصيل الطلب (اختياري)</Text>
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
        </ScrollView>

        {/* Sticky CTA — a normal flex sibling of the ScrollView (not an
            absolute overlay), so it always occupies its own space and can
            never cover a field or a service card; KeyboardAvoidingView
            carries it up above the keyboard along with the scroll content. */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* The button says what the next press actually does: at a booked-out
              company the request joins a queue, and knowing that before
              pressing is the whole point of saying it here. */}
          <Button
            label={companyBusy ? "ابعت واحجز دورك" : "إرسال الطلب"}
            onPress={onSubmit}
            busy={busy}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Mirrors the website's Select, whose first option is the empty
          "اختر خدمة (اختياري)" — so choosing nothing stays reachable after a
          pick, not a one-way door. */}
      <Modal visible={servicePickerOpen} transparent animationType="slide" onRequestClose={() => setServicePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setServicePickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>الخدمة المطلوبة</Text>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                setService("");
                setServicePickerOpen(false);
              }}
            >
              <Text style={[styles.sheetRowText, styles.sheetRowMuted]}>اختر خدمة (اختياري)</Text>
            </Pressable>
            {(company?.services ?? []).map((s) => (
              <Pressable
                key={s}
                style={styles.sheetRow}
                onPress={() => {
                  setService(s);
                  setServicePickerOpen(false);
                }}
              >
                <Text style={styles.sheetRowText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={districtPickerOpen} transparent animationType="slide" onRequestClose={() => setDistrictPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDistrictPickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>اختر حيّك</Text>
            {districts.map((d) => (
              <Pressable
                key={d}
                style={styles.sheetRow}
                onPress={() => {
                  contactTouched.current = true;
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
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  scroll: { padding: 16, paddingBottom: 8, gap: 22 },

  contextBlock: { gap: 4 },
  contextCompany: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.title.fontSize, color: colors.onSurface, textAlign: "right" },
  contextSubtitle: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right" },

  busyBox: { flexDirection: rowStart, alignItems: "flex-start", gap: 10, backgroundColor: colors.warningContainer, borderRadius: 14, padding: 12 },
  busyText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: type.caption.fontSize, color: colors.onWarningContainer, textAlign: "right", lineHeight: 20 },
  errorBox: { backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },

  // ── Smart pre-fill notice ────────────────────────────────────────────────
  // row-reverse to match the form's own RTL flow (icon on the trailing/right
  // edge, "Clear" on the leading/left) — same convention as errorBox's
  // siblings elsewhere in this screen, which are all textAlign: "right".
  prefillBox: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.successContainer,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  prefillText: {
    flex: 1,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onSuccessContainer,
    textAlign: "right",
  },
  prefillClear: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSuccessContainer,
    textDecorationLine: "underline",
  },

  section: { gap: 14 },
  sectionLabel: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },

  field: { gap: 6 },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant, textAlign: "right" },
  // A phone number is a PHYSICAL left-to-right run — the dial code sits to
  // the left of the digits and the divider between them, exactly as the
  // website spells it (`dir="ltr"` on PhoneInput.tsx's field wrapper). A
  // hardcoded "row" only means that while the engine is LTR: on the phone,
  // where forceRTL has taken effect, it put the dial code on the RIGHT with
  // its divider on the outer edge. `rowLtr` is left-to-right under either
  // engine.
  phoneRow: {
    flexDirection: rowLtr,
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
    // Physical right edge, not `borderEnd`: this row is pinned left-to-right
    // above, so the divider belongs on the dial code's right in both engines.
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
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surfaceContainerLowest,
  },
  districtValue: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  districtPlaceholder: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.outline, textAlign: "right" },
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

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    // A real shadow (not just the border) is what separates a docked action
    // bar from the content behind it — the border alone reads as flat.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 24 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, textAlign: "right", paddingHorizontal: 20, paddingVertical: 12 },
  sheetRow: { paddingHorizontal: 20, paddingVertical: 14 },
  sheetRowText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  sheetRowMuted: { color: colors.outline },

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
  estimateRow: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center" },
  estimateLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.outline },
  estimateValue: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.title.fontSize, color: colors.primary },
  estimateNote: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary, textAlign: "right" },
  estimateFooter: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  successBtn: { marginTop: 20, alignSelf: "stretch" },
});
