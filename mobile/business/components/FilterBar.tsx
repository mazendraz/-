import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

const STATUS_LABELS: Record<ApiLeadStatus, string> = {
  New: "جديد",
  Contacted: "تم التواصل",
  "In Progress": "قيد التنفيذ",
  Completed: "مكتمل",
  Cancelled: "ملغي",
};

const ALL_STATUSES: ApiLeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];

export default function FilterBar({
  status,
  onStatusChange,
  search,
  onSearchChange,
}: {
  status: ApiLeadStatus | undefined;
  onStatusChange: (status: ApiLeadStatus | undefined) => void;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={onSearchChange}
        placeholder="بحث بالاسم أو رقم الطلب"
        placeholderTextColor={colors.onSurfaceVariant}
        textAlign={textStart === "right" ? "right" : "left"}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="الكل" active={!status} onPress={() => onStatusChange(undefined)} />
        {ALL_STATUSES.map((s) => (
          <Chip key={s} label={STATUS_LABELS[s]} active={status === s} onPress={() => onStatusChange(s)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  search: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  chips: { flexDirection: "row-reverse", gap: 8, paddingBottom: 4 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surfaceContainer,
  },
  chipActive: { backgroundColor: colors.primary },
  chipLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  chipLabelActive: { color: colors.onPrimary },
});
