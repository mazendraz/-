import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchProfile, submitProfileChange, type ApiChangeRequest, type CompanyEditableFields } from "../lib/profile";
import { uploadProviderMedia } from "../lib/providerUpload";
import Button from "../components/Button";
import GalleryManager from "../components/GalleryManager";
import MediaPicker from "../components/MediaPicker";
import TextField from "../components/TextField";
import PendingChangeBanner from "../components/PendingChangeBanner";
import CompanySectionNav from "../components/CompanySectionNav";
import SectionHeader from "../components/SectionHeader";
import { ListSkeleton, ErrorCard } from "../components/ListStates";
import FormScroll from "../components/FormScroll";

/** The text half of CompanyEditableFields — `gallery` is a list and is
 *  compared separately in changedFields(), since `!==` on two arrays only ever
 *  asks whether they are the same object. */
const TEXT_KEYS = ["tagline", "about", "phone", "whatsapp", "email", "location", "responseTime", "logo", "cover"] as const;

export default function Profile() {
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [contact, setContact] = useState<{ email: string | null; whatsapp: string | null } | null>(null);
  const [pending, setPending] = useState<ApiChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<CompanyEditableFields>({});
  const [submitting, setSubmitting] = useState(false);

  // Kept in a ref because load() is a stable useCallback that must still be
  // able to ask "is anything unsaved right now?" — see its use below.
  const dirty = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const profile = await fetchProfile();
      setCompany(profile.company);
      setContact(profile.contact);
      setPending(profile.pending);
      // A SILENT refresh must not overwrite unsaved edits. useRefreshOnFocus
      // fires one whenever the app returns to the foreground — and adding a
      // gallery photo means leaving the app for the system picker, so coming
      // back with the new image staged is exactly the moment this runs. It
      // used to reset the form and the picked media was simply gone.
      // `company` above is still refreshed, so the comparison in
      // changedFields() is always against the current server state.
      if (silent && dirty.current) return;
      setFields({
        tagline: profile.company.tagline,
        about: profile.company.about,
        phone: profile.company.phone,
        whatsapp: profile.contact.whatsapp ?? "",
        email: profile.contact.email ?? "",
        location: profile.company.location,
        responseTime: profile.company.responseTime,
        logo: profile.company.logo,
        cover: profile.company.cover,
        gallery: profile.company.gallery ?? [],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات الشركة. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  // Only fields that actually CHANGED from the loaded values go in the
  // request — matches submitChangeRequestSchema's own rule ("at least one
  // change is required") and avoids re-filing the same value as a no-op edit.
  function changedFields(): CompanyEditableFields {
    if (!company || !contact) return {};
    const original: Record<(typeof TEXT_KEYS)[number], string> = {
      tagline: company.tagline,
      about: company.about,
      phone: company.phone,
      whatsapp: contact.whatsapp ?? "",
      email: contact.email ?? "",
      location: company.location,
      responseTime: company.responseTime,
      logo: company.logo,
      cover: company.cover,
    };
    const out: CompanyEditableFields = {};
    TEXT_KEYS.forEach((key) => {
      const value = fields[key] ?? "";
      if (value !== (original[key] ?? "")) out[key] = value;
    });

    // Element-wise, and order-sensitive on purpose: reordering the gallery
    // changes no member of it, only the sequence the profile renders them in,
    // and that reorder is exactly the edit a provider comes here to make.
    const gallery = fields.gallery ?? [];
    const originalGallery = company.gallery ?? [];
    const galleryChanged =
      gallery.length !== originalGallery.length || gallery.some((url, i) => url !== originalGallery[i]);
    if (galleryChanged) out.gallery = gallery;

    return out;
  }

  const changes = changedFields();
  const hasChanges = Object.keys(changes).length > 0;
  dirty.current = hasChanges;

  async function handleSubmit() {
    if (!company || !hasChanges || submitting) return;
    setSubmitting(true);
    try {
      const created = await submitProfileChange(company.id, changes);
      setPending(created);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إرسال التعديل.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "بيانات الشركة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : company ? (
          <FormScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {pending ? <PendingChangeBanner request={pending} /> : null}

            <Text style={styles.readonlyName}>{company.name}</Text>

            {/* ── Everything else about this company, from inside it ────────
                These five screens existed already, but the only way to reach
                them was to leave the company page entirely and go out to the
                More menu. That is backwards: a provider looking at their own
                business is exactly where "my prices" and "my portfolio"
                belong. The admin's company screen has had this same nav all
                along (company/[id]/index.tsx) — this is the provider side
                catching up, with the routes that are theirs. */}
            <CompanySectionNav
              sections={[
                { label: "قائمة الأسعار", onPress: () => router.push("/offerings") },
                { label: "خصومات الباقات", onPress: () => router.push("/bundle-rules") },
                { label: "معرض الأعمال", onPress: () => router.push("/projects") },
                { label: "التوفر وفترات الانشغال", onPress: () => router.push("/availability") },
                { label: "قائمة الانتظار", onPress: () => router.push("/waitlist") },
              ]}
            />

            <TextField label="الشعار" value={fields.tagline ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, tagline: v }))} />
            <TextField
              label="نبذة عن الشركة"
              value={fields.about ?? ""}
              onChangeText={(v) => setFields((f) => ({ ...f, about: v }))}
              multiline
              numberOfLines={4}
              style={styles.textArea}
            />
            {/* ── Images ───────────────────────────────────────────────────
                The whole reason this screen needed a second pass: a provider
                shoots their logo, their cover and their work on the phone, and
                every one of those had to go through the website to reach the
                profile.

                No Remove on these two — the columns are required, so `""` is a
                400 and not an "empty logo" (MediaPicker's `clearable`). The
                gallery below is a list and CAN be emptied. */}
            <SectionHeader title="صور الشركة" />
            <MediaPicker
              label="اللوجو"
              shape="logo"
              value={fields.logo ?? ""}
              onChange={(v) => setFields((f) => ({ ...f, logo: v }))}
              upload={(file) => uploadProviderMedia("logos", file)}
              disabled={submitting}
              clearable={false}
            />
            <MediaPicker
              label="صورة الغلاف"
              shape="cover"
              value={fields.cover ?? ""}
              onChange={(v) => setFields((f) => ({ ...f, cover: v }))}
              upload={(file) => uploadProviderMedia("covers", file)}
              disabled={submitting}
              clearable={false}
            />

            {/* The company's own photo/video gallery — NOT "معرض الأعمال" in
                the nav above, which is the titled project portfolio. Both are
                called a معرض in Arabic and they are two different records, so
                the hint under the title says which one this is. */}
            <SectionHeader title="معرض الصور والفيديو" />
            <Text style={styles.sectionHint}>
              دي الصور والفيديوهات اللي بتظهر في صفحة شركتك. الترتيب هنا هو نفس ترتيب العرض، وأي تعديل بيروح
              للمراجعة زي باقي البيانات.
            </Text>
            <GalleryManager
              images={fields.gallery ?? []}
              onChange={(gallery) => setFields((f) => ({ ...f, gallery }))}
              upload={(file) => uploadProviderMedia("gallery", file)}
              disabled={submitting}
            />

            <TextField label="رقم الهاتف" value={fields.phone ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <TextField label="واتساب" value={fields.whatsapp ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, whatsapp: v }))} keyboardType="phone-pad" />
            <TextField label="البريد الإلكتروني" value={fields.email ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
            <TextField label="الموقع" value={fields.location ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, location: v }))} />
            <TextField label="مدة الرد المتوقعة" value={fields.responseTime ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, responseTime: v }))} placeholder="مثلاً: خلال ساعة" />

            <Button
              label={submitting ? "بيترسل..." : "إرسال للمراجعة"}
              onPress={handleSubmit}
              busy={submitting}
              disabled={!hasChanges || submitting}
              style={styles.submit}
            />
            {!hasChanges ? <Text style={styles.noChangesHint}>غيّر أي حقل عشان تقدر ترسل تعديل.</Text> : null}
          </FormScroll>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  readonlyName: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  sectionHint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    marginTop: -8,
  },
  submit: { marginTop: 4 },
  noChangesHint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
});
