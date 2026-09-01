import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ApiProject } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { assetUri, textStart } from "@alassema/mobile-shared";

const STATUS_LABEL: Record<NonNullable<ApiProject["status"]>, { label: string; tone: "pending" | "approved" | "rejected" }> = {
  PENDING: { label: "بانتظار المراجعة", tone: "pending" },
  APPROVED: { label: "منشور", tone: "approved" },
  REJECTED: { label: "مرفوض", tone: "rejected" },
};

export default function ProjectCard({ project, onDelete }: { project: ApiProject; onDelete: () => void }) {
  const status = project.status ? STATUS_LABEL[project.status] : null;

  return (
    <View style={styles.card}>
      {/* expo-image, not RN's Image — uploaded photos are WebP, and RN's own
          Image has no iOS WebP decoder (a hard-learned lesson elsewhere in
          this codebase — see mobile/client's own comments on the same).
          assetUri: a seeded project's img can still be root-relative. */}
      <Image source={{ uri: assetUri(project.img) }} style={styles.thumb} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{project.title}</Text>
        <Text style={styles.year}>{project.year}</Text>
        {status ? (
          <Text style={[styles.status, styles[`status_${status.tone}`]]}>{status.label}</Text>
        ) : null}
      </View>
      <Pressable style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteLabel}>حذف</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    overflow: "hidden",
  },
  thumb: { width: "100%", height: 140, backgroundColor: colors.surfaceContainer },
  info: { padding: 12, gap: 3 },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  year: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  status: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", textAlign: textStart, marginTop: 2 },
  status_pending: { color: "#a16207" },
  status_approved: { color: colors.success },
  status_rejected: { color: colors.error },
  deleteBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deleteLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: "#fff" },
});
