import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { colors, type } from "@alassema/core";
import { ApiError, assetUri, rowStart } from "@alassema/mobile-shared";
import { uploadAdminImage } from "../lib/adminUpload";
import Icon from "./Icon";

/** Mirrors upload.service.ts's own MAX_UPLOAD_BYTES / MAX_VIDEO_UPLOAD_BYTES.
 *  Video gets the larger cap because there is no server-side processing step
 *  for it (no ffmpeg in this repo) — it is stored exactly as uploaded. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Extension-based, matching the website's `isVideoUrl` in lib/image.ts.
 *  Videos are stored as-is, so the upload's own extension is a reliable
 *  signal — there is no re-encoding step that could change it. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(url.split(/[?#]/)[0]);
}

/**
 * Add (via expo-image-picker + upload), remove, and reorder — up/down
 * buttons, not drag-and-drop: this app has no gesture library dependency,
 * and a company gallery is a handful of items, not a long list a
 * drag-reorder would meaningfully speed up.
 *
 * ── Video ──────────────────────────────────────────────────────────────────
 * The gallery takes video as well as stills. That was never a new capability:
 * the API has accepted MP4/WebM/MOV into the `gallery` bucket all along
 * (upload.service.ts's `sniffVideoMime`/`passthroughVideo`, with its own 50MB
 * cap), and the website has been uploading them. This screen simply never
 * offered it — `mediaTypes: ["images"]` meant a provider on a phone, holding
 * the one device that actually shoots the video, was the only one who could
 * not add it.
 *
 * The two size caps mirror the server's exactly, and are checked before the
 * file goes over the wire so an oversized upload fails in a sentence rather
 * than after a long progress bar.
 */
export default function GalleryManager({ images, onChange }: { images: string[]; onChange: (next: string[]) => void }) {
  const [uploading, setUploading] = useState(false);

  async function addMedia() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("محتاجين إذن الصور", "من غير إذن الوصول للصور مش هنقدر نرفع ملفات.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const video = asset.type === "video";
    const limit = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (asset.fileSize != null && asset.fileSize > limit) {
      Alert.alert(
        "الملف كبير",
        video ? "الفيديو لازم يكون 50 ميجا أو أقل." : "الصورة لازم تكون 5 ميجا أو أقل.",
      );
      return;
    }

    setUploading(true);
    try {
      const url = await uploadAdminImage("gallery", {
        uri: asset.uri,
        name: asset.fileName ?? `gallery-${Date.now()}.${video ? "mp4" : "jpg"}`,
        type: asset.mimeType ?? (video ? "video/mp4" : "image/jpeg"),
      });
      onChange([...images, url]);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر رفع الملف.");
    } finally {
      setUploading(false);
    }
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <View style={styles.wrap}>
      {images.map((uri, i) => (
        <View key={`${uri}-${i}`} style={styles.row}>
          {/* assetUri: a seeded company's gallery can still hold a root-
              relative path ("/img/seed-15.jpg") — RN has no origin to
              resolve that against, unlike a browser. The raw `uri` stays
              in `images`/`onChange` untouched; only the rendered source is
              resolved, so reordering/removing never writes back a resolved
              absolute URL over what may still be a relative one. */}
          {isVideoUrl(uri) ? (
            // expo-image cannot decode a video container, so a plain <Image>
            // here renders an empty grey box. A labelled placeholder says what
            // the item actually is.
            <View style={[styles.thumb, styles.videoThumb]}>
              <Icon name="play_arrow" size={26} color={colors.onPrimary} />
            </View>
          ) : (
            <Image source={{ uri: assetUri(uri) }} style={styles.thumb} contentFit="cover" />
          )}
          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} disabled={i === 0} onPress={() => move(i, -1)}>
              <Text style={[styles.actionText, i === 0 && styles.actionTextDisabled]}>▲</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} disabled={i === images.length - 1} onPress={() => move(i, 1)}>
              <Text style={[styles.actionText, i === images.length - 1 && styles.actionTextDisabled]}>▼</Text>
            </Pressable>
            <Pressable style={styles.removeBtn} onPress={() => remove(i)}>
              <Text style={styles.removeText}>حذف</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable style={styles.addBtn} onPress={addMedia} disabled={uploading}>
        <Text style={styles.addText}>{uploading ? "بيترفع..." : "+ إضافة صورة أو فيديو"}</Text>
      </Pressable>
      <Text style={styles.limitHint}>الصور لحد 5 ميجا · الفيديو لحد 50 ميجا (MP4 / WebM / MOV)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 8,
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surfaceContainer },
  videoThumb: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  actions: { flex: 1, flexDirection: rowStart, alignItems: "center", gap: 8 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surfaceContainer, borderRadius: 8 },
  actionText: { fontSize: type.body.fontSize, color: colors.onSurface },
  actionTextDisabled: { color: colors.outlineVariant },
  removeBtn: { marginStart: "auto", backgroundColor: colors.errorContainer, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  removeText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onErrorContainer },
  addBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderStyle: "dashed",
    paddingVertical: 14,
    alignItems: "center",
  },
  addText: { fontFamily: "Cairo_600SemiBold", fontSize: type.body.fontSize, color: colors.onSurfaceVariant },
  limitHint: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "center" },
});
