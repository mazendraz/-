import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { colors, type } from "@alassema/core";
import { ApiError, assetUri } from "@alassema/mobile-shared";
import { uploadAdminImage } from "../lib/adminUpload";

/**
 * Add (via expo-image-picker + upload), remove, and reorder — up/down
 * buttons, not drag-and-drop: this app has no gesture library dependency,
 * and a company gallery is a handful of images, not a long list a
 * drag-reorder would meaningfully speed up.
 */
export default function GalleryManager({ images, onChange }: { images: string[]; onChange: (next: string[]) => void }) {
  const [uploading, setUploading] = useState(false);

  async function addImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("محتاجين إذن الصور", "من غير إذن الوصول للصور مش هنقدر نرفع صورة.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const url = await uploadAdminImage("gallery", {
        uri: asset.uri,
        name: asset.fileName ?? `gallery-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      });
      onChange([...images, url]);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر رفع الصورة.");
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
          <Image source={{ uri: assetUri(uri) }} style={styles.thumb} contentFit="cover" />
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
      <Pressable style={styles.addBtn} onPress={addImage} disabled={uploading}>
        <Text style={styles.addText}>{uploading ? "بيترفع..." : "+ إضافة صورة"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 8,
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surfaceContainer },
  actions: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
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
});
