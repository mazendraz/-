import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import type { ApprovalQueue } from "../lib/approvals";

const LABELS: Record<ApprovalQueue, string> = {
  changeRequest: "طلبات التعديل",
  project: "المشاريع",
  review: "التقييمات",
  siteReview: "آراء العملاء",
  feedback: "الرسائل",
};

const ORDER: ApprovalQueue[] = ["changeRequest", "project", "review", "siteReview", "feedback"];

export default function QueueSegments({
  active,
  counts,
  onSelect,
}: {
  active: ApprovalQueue;
  counts: Record<ApprovalQueue, number>;
  onSelect: (queue: ApprovalQueue) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>
      {ORDER.map((q) => {
        const isActive = q === active;
        const count = counts[q];
        return (
          <Pressable key={q} onPress={() => onSelect(q)} style={[styles.chip, isActive && styles.chipActive]}>
            <Text style={[styles.label, isActive && styles.labelActive]}>{LABELS[q]}</Text>
            {count > 0 ? (
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{count > 99 ? "99+" : count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surfaceContainer,
  },
  chipActive: { backgroundColor: colors.primary },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  labelActive: { color: colors.onPrimary },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeActive: { backgroundColor: colors.onPrimary },
  badgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: colors.onError },
  badgeTextActive: { color: colors.primary },
});
