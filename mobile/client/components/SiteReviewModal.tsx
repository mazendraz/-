import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import Button from "./Button";
import Captcha from "./Captcha";
import { ApiError } from "../lib/api";
import { captchaConfigured } from "../lib/captcha";
import { submitSiteReview } from "../lib/siteReviews";

/** Share a general (not-tied-to-one-company) site review — the mobile
 *  counterpart of the website's SiteReviewModal in Home.tsx. */
export default function SiteReviewModal({
  visible,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const canSubmit = name.trim().length >= 2 && district.trim().length >= 2 && rating > 0 && text.trim().length >= 5;

  async function onSubmit() {
    if (!canSubmit) return;
    if (captchaConfigured() && !captchaToken) {
      setError("استنى ثانية لحد ما التحقق يخلص وبعدين جرّب تاني.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitSiteReview({ name: name.trim(), district: district.trim(), rating, text: text.trim(), captchaToken });
      setName("");
      setDistrict("");
      setRating(0);
      setText("");
      setCaptchaToken(null);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال رأيك. جرّب تاني.");
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>شاركنا رأيك</Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                <Text style={[styles.star, n <= rating && styles.starFilled]}>★</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="اسمك"
            placeholderTextColor={colors.outline}
            style={styles.input}
            textAlign="right"
          />
          <TextInput
            value={district}
            onChangeText={setDistrict}
            placeholder="حيّك"
            placeholderTextColor={colors.outline}
            style={styles.input}
            textAlign="right"
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="رأيك في العاصمة"
            placeholderTextColor={colors.outline}
            style={styles.textArea}
            textAlign="right"
            multiline
            numberOfLines={3}
          />

          <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />

          {error !== "" && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Button label={busy ? "بيتبعت…" : "إرسال"} onPress={onSubmit} busy={busy} disabled={!canSubmit} />
            <Button label="إلغاء" variant="secondary" onPress={onClose} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "center" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 6 },
  star: { fontSize: 34, color: colors.outlineVariant },
  starFilled: { color: "#f59e0b" },
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
  textArea: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  error: { fontFamily: "Cairo_500Medium", fontSize: type.caption.fontSize, color: colors.error, textAlign: "center" },
  actions: { gap: 10 },
});
