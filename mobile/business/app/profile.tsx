import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchProfile, submitProfileChange, type ApiChangeRequest, type CompanyEditableFields } from "../lib/profile";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PendingChangeBanner from "../components/PendingChangeBanner";
import { ListSkeleton, ErrorCard } from "../components/ListStates";

export default function Profile() {
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [contact, setContact] = useState<{ email: string | null; whatsapp: string | null } | null>(null);
  const [pending, setPending] = useState<ApiChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<CompanyEditableFields>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const profile = await fetchProfile();
      setCompany(profile.company);
      setContact(profile.contact);
      setPending(profile.pending);
      setFields({
        tagline: profile.company.tagline,
        about: profile.company.about,
        phone: profile.company.phone,
        whatsapp: profile.contact.whatsapp ?? "",
        email: profile.contact.email ?? "",
        location: profile.company.location,
        responseTime: profile.company.responseTime,
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
    const original: Record<string, string> = {
      tagline: company.tagline,
      about: company.about,
      phone: company.phone,
      whatsapp: contact.whatsapp ?? "",
      email: contact.email ?? "",
      location: company.location,
      responseTime: company.responseTime,
    };
    const out: CompanyEditableFields = {};
    (Object.keys(fields) as (keyof CompanyEditableFields)[]).forEach((key) => {
      const value = fields[key] ?? "";
      if (value !== (original[key] ?? "")) out[key] = value;
    });
    return out;
  }

  const changes = changedFields();
  const hasChanges = Object.keys(changes).length > 0;

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
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {pending ? <PendingChangeBanner request={pending} /> : null}

            <Text style={styles.readonlyName}>{company.name}</Text>

            <TextField label="الشعار" value={fields.tagline ?? ""} onChangeText={(v) => setFields((f) => ({ ...f, tagline: v }))} />
            <TextField
              label="نبذة عن الشركة"
              value={fields.about ?? ""}
              onChangeText={(v) => setFields((f) => ({ ...f, about: v }))}
              multiline
              numberOfLines={4}
              style={styles.textArea}
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
          </ScrollView>
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
  submit: { marginTop: 4 },
  noChangesHint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
});
