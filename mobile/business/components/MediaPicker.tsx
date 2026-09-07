import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { colors, type } from "@alassema/core";
import { ApiError, assetUri, rowStart, textStart } from "@alassema/mobile-shared";
import Icon from "./Icon";

/** Mirrors the backend's own MAX_UPLOAD_BYTES (upload.service.ts). Checked
 *  here so an oversized file is refused before it is pushed over the wire,
 *  the same way the website's lib/image.ts checks before POSTing. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type MediaShape = "logo" | "cover";

/**
 * Single-image picker for a company's Logo and Cover — the mobile counterpart
 * of the website's provider `ImagePicker`, built to the same shape so the two
 * surfaces behave alike.
 *
 * ── What it replaced ───────────────────────────────────────────────────────
 * Both fields were a bare `TextInput` labelled "اللوجو (رابط الصورة)" — you
 * could only set a company's logo by typing an image URL into a text box. On a
 * phone, where the image is in the camera roll, that is not a hard flow, it is
 * an impossible one. The website has had a real uploader for these two fields
 * all along; this closes that gap rather than inventing a third design.
 *
 * From the website, kept:
 *   • a tap-anywhere preview box, square for a logo and wide for a cover;
 *   • explicit Replace / Remove buttons that are ALWAYS visible rather than
 *     revealed on hover — there is no hover on a phone;
 *   • the recommended-dimensions caption under the box;
 *   • the "paste a URL instead" escape hatch, collapsed behind a toggle so it
 *     never competes with the normal path.
 *
 * `upload` is injected rather than imported: admins post to `/admin/upload`
 * and providers to `/provider/upload`, and admin/upload 403s for a provider.
 * Passing the function in is what lets one component serve both without
 * knowing which role is using it.
 */
export default function MediaPicker({
  label,
  value,
  onChange,
  shape,
  upload,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  shape: MediaShape;
  upload: (file: { uri: string; name: string; type: string }) => Promise<string>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  async function pick() {
    if (disabled || busy) return;
    setError("");

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("محتاجين إذن الصور", "من غير إذن الوصول للصور مش هنقدر نرفع صورة.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // A logo is square by definition; a cover is a wide banner. Cropping to
      // the shape the site will render avoids uploading an image that gets
      // silently centre-cropped into something the provider never saw.
      allowsEditing: true,
      aspect: shape === "logo" ? [1, 1] : [3, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (asset.fileSize != null && asset.fileSize > MAX_IMAGE_BYTES) {
      setError("الصورة لازم تكون 5 ميجا أو أقل.");
      return;
    }

    setBusy(true);
    try {
      onChange(
        await upload({
          uri: asset.uri,
          name: asset.fileName ?? `${shape}-${Date.now()}.jpg`,
          type: asset.mimeType ?? "image/jpeg",
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر رفع الصورة. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  const boxStyle = shape === "logo" ? styles.boxLogo : styles.boxCover;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={value ? undefined : pick}
        disabled={disabled || busy}
        style={({ pressed }) => [
          styles.box,
          boxStyle,
          !value && styles.boxEmpty,
          pressed && !value && styles.boxPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label} — صورة مرفوعة` : `${label} — رفع صورة`}
      >
        {value ? (
          <Image
            // assetUri: a seeded company can still hold a root-relative path
            // ("/img/seed-15.jpg"), which RN has no origin to resolve. Only the
            // rendered source is resolved — `value` is passed back untouched.
            source={{ uri: assetUri(value) }}
            style={styles.preview}
            contentFit={shape === "logo" ? "contain" : "cover"}
          />
        ) : busy ? null : (
          <View style={styles.emptyInner}>
            <Icon name="cloud_upload" size={30} color={colors.outline} />
            <Text style={styles.emptyText}>اضغط لرفع صورة</Text>
          </View>
        )}

        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.busyText}>جاري الرفع…</Text>
          </View>
        ) : null}
      </Pressable>

      {/* Always visible, not revealed on hover — there is no hover here. */}
      {value && !busy ? (
        <View style={styles.actions}>
          <Pressable
            onPress={pick}
            disabled={disabled}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
            accessibilityRole="button"
          >
            <Icon name="sync" size={16} color={colors.onSurface} />
            <Text style={styles.actionText}>استبدال</Text>
          </Pressable>
          <Pressable
            onPress={() => onChange("")}
            disabled={disabled}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
            accessibilityRole="button"
          >
            <Icon name="delete" size={16} color={colors.error} />
            <Text style={[styles.actionText, styles.actionTextDanger]}>إزالة</Text>
          </Pressable>
        </View>
      ) : null}

      {!value && !busy ? (
        <Pressable
          onPress={pick}
          disabled={disabled}
          style={({ pressed }) => [styles.uploadBtn, pressed && styles.actionBtnPressed]}
          accessibilityRole="button"
        >
          <Icon name="upload" size={16} color={colors.onSurface} />
          <Text style={styles.actionText}>رفع صورة</Text>
        </Pressable>
      ) : null}

      <Text style={styles.recommended}>
        {shape === "logo"
          ? "المقاس المناسب: 512×512 بكسل، مربع · لحد 5 ميجا"
          : "المقاس المناسب: 1200×400 بكسل · لحد 5 ميجا"}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => setShowUrl((v) => !v)} hitSlop={6} accessibilityRole="button">
        <Text style={styles.urlToggle}>الصق رابط صورة بدلًا من كده</Text>
      </Pressable>
      {showUrl ? (
        <View style={styles.urlRow}>
          <TextInput
            style={styles.urlInput}
            value={urlDraft}
            onChangeText={setUrlDraft}
            placeholder="https://…"
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Pressable
            onPress={() => {
              onChange(urlDraft.trim());
              setUrlDraft("");
              setShowUrl(false);
            }}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>تطبيق</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  box: {
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerLowest,
  },
  boxLogo: { width: 128, height: 128, alignSelf: "flex-start" },
  boxCover: { width: "100%", height: 150 },
  boxEmpty: { borderWidth: 2, borderColor: colors.outlineVariant, borderStyle: "dashed" },
  boxPressed: { backgroundColor: colors.surfaceContainer },
  preview: { width: "100%", height: "100%" },
  emptyInner: { alignItems: "center", gap: 6, paddingHorizontal: 12 },
  emptyText: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.outline,
    textAlign: "center",
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  busyText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.outline },
  actions: { flexDirection: rowStart, gap: 8 },
  actionBtn: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionBtnPressed: { backgroundColor: colors.surfaceContainerHigh },
  actionText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  actionTextDanger: { color: colors.error },
  uploadBtn: {
    flexDirection: rowStart,
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recommended: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: textStart,
  },
  error: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.error,
    textAlign: textStart,
  },
  urlToggle: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.outline,
    textDecorationLine: "underline",
    textAlign: textStart,
  },
  urlRow: { flexDirection: rowStart, gap: 8, alignItems: "center" },
  urlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    textAlign: textStart,
  },
});
