import { StyleSheet, TextInput, View } from "react-native";
import type { ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { ChipBar, Chip } from "./ChipBar";

const STATUS_LABELS: Record<ApiLeadStatus, string> = {
  New: "جديد",
  Contacted: "تم التواصل",
  "In Progress": "قيد التنفيذ",
  Completed: "مكتمل",
  Cancelled: "ملغي",
};

const ALL_STATUSES: ApiLeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];

/**
 * The leads list's search + status filter.
 *
 * The chips are ChipBar/Chip rather than a hand-rolled ScrollView of pills.
 * This screen was one of the ones ChipBar's own header comment was written
 * about, and it carried both of the bugs that component exists to prevent: a
 * bar that stretches its chips into lozenges when the list below is empty, and
 * — because "الكل" is laid at the start edge while the scroll view measures
 * from the other one — a bar that opened with its own ACTIVE filter scrolled
 * off screen. Nothing here draws a pill any more; it only says which pills.
 */
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
      <ChipBar style={styles.chips}>
        <Chip label="الكل" active={!status} onPress={() => onStatusChange(undefined)} />
        {ALL_STATUSES.map((s) => (
          <Chip
            key={s}
            label={STATUS_LABELS[s]}
            active={status === s}
            onPress={() => onStatusChange(s)}
          />
        ))}
      </ChipBar>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12 },
  search: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
  },
  chips: { paddingVertical: 10 },
});
