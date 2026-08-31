import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import Button from "./Button";
import { ApiError } from "@alassema/mobile-shared";
import { submitReview } from "../lib/reviews";

/**
 * Rate a completed request — a modal rather than its own route, matching
 * Account.tsx's delete-confirmation pattern: this is a short, one-shot
 * action over content the customer is already looking at (their request
 * card), not a flow that needs its own back-stack entry.
 */
export default function ReviewModal({
  visible,
  leadId,
  companyName,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  leadId: string;
  companyName: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit() {
    if (rating === 0) return;
    setBusy(true);
    setError("");
    try {
      await submitReview(leadId, rating, text.trim() || undefined);
      onSubmitted();
      setRating(0);
      setText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال التقييم.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>قيّم {companyName}</Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`قيّم ${n} نجوم`}
                accessibilityState={{ selected: n <= rating }}
              >
                <Text style={[styles.star, n <= rating && styles.starFilled]}>★</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="اكتب رأيك (اختياري)"
            placeholderTextColor={colors.outline}
            style={styles.textArea}
            textAlign="right"
            multiline
            numberOfLines={3}
          />

          {error !== "" && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Button label={busy ? "بيتبعت…" : "إرسال التقييم"} onPress={onSubmit} busy={busy} disabled={rating === 0} />
            <Button label="إلغاء" variant="secondary" onPress={onClose} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 20, padding: 20, gap: 14 },
  title: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "center" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 6 },
  star: { fontSize: 34, color: colors.outlineVariant },
  starFilled: { color: "#f59e0b" },
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
