import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import Button from "./Button";
import Captcha from "./Captcha";
import { ApiError } from "../lib/api";
import { captchaConfigured } from "../lib/captcha";
import { submitFeedback, type FeedbackType } from "../lib/feedback";

const TYPES: { key: FeedbackType; label: string }[] = [
  { key: "problem", label: "بلاغ عن مشكلة" },
  { key: "suggestion", label: "اقتراح" },
  { key: "inquiry", label: "استفسار" },
];

/** "Report a problem" / suggestion / inquiry about one company — the mobile
 *  counterpart of the website's feedback form (feedback.ts). Contact fields
 *  are optional: the message alone is enough to submit. */
export default function FeedbackModal({
  visible,
  companySlug,
  companyName,
  onClose,
}: {
  visible: boolean;
  companySlug: string;
  companyName: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>("problem");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  function reset() {
    setType("problem");
    setMessage("");
    setPhone("");
    setError("");
    setDone(false);
    setCaptchaToken(null);
  }

  async function onSubmit() {
    if (!message.trim()) return;
    if (captchaConfigured() && !captchaToken) {
      setError("استنى ثانية لحد ما التحقق يخلص وبعدين جرّب تاني.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitFeedback({ companySlug, type, message: message.trim(), phone: phone.trim() || undefined, captchaToken });
      setDone(true);
      setTimeout(() => {
        reset();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال البلاغ.");
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {done ? (
            <Text style={styles.thanks}>وصلنا بلاغك، شكرًا ليك.</Text>
          ) : (
            <>
              <Text style={styles.title}>تواصل بخصوص {companyName}</Text>

              <View style={styles.typeRow}>
                {TYPES.map((t) => (
                  <Pressable
                    key={t.key}
                    style={[styles.typeChip, type === t.key && styles.typeChipActive]}
                    onPress={() => setType(t.key)}
                  >
                    <Text style={[styles.typeChipText, type === t.key && styles.typeChipTextActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="اكتب رسالتك"
                placeholderTextColor={colors.outline}
                style={styles.textArea}
                textAlign="right"
                multiline
                numberOfLines={4}
              />

              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="رقم للتواصل (اختياري)"
                placeholderTextColor={colors.outline}
                style={styles.input}
                textAlign="right"
                keyboardType="phone-pad"
              />

              <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />

              {error !== "" && <Text style={styles.error}>{error}</Text>}

              <View style={styles.actions}>
                <Button label={busy ? "بيتبعت…" : "إرسال"} onPress={onSubmit} busy={busy} disabled={!message.trim()} />
                <Button
                  label="إلغاء"
                  variant="secondary"
                  onPress={() => {
                    reset();
                    onClose();
                  }}
                  disabled={busy}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 20, padding: 20, gap: 14 },
  title: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "center" },
  typeRow: { flexDirection: "row-reverse", gap: 8 },
  typeChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  typeChipActive: { backgroundColor: colors.primary },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  typeChipTextActive: { color: colors.onPrimary },
  textArea: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    textAlignVertical: "top",
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  error: { fontFamily: "Cairo_500Medium", fontSize: type.caption.fontSize, color: colors.error, textAlign: "center" },
  actions: { gap: 10 },
  thanks: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "center", paddingVertical: 20 },
});
