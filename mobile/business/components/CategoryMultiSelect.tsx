import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApiAdminCategory } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import Icon from "./Icon";

/** How many options to show at once. Same number the website's own
 *  CategoryMultiSelect slices to, so the two feel identical. */
const VISIBLE_OPTIONS = 8;

/**
 * A company's categories — the mobile counterpart of the website's
 * `CategoryMultiSelect`, deliberately built to the SAME model rather than a
 * new one.
 *
 * ── Why it replaced the old chip grid ──────────────────────────────────────
 * This used to render EVERY category in the catalogue as a chip in a wrapping
 * grid, with selection by tap and removal by long-press. That is fine at six
 * categories and falls apart at sixty: the form grows without limit, the
 * selected ones are lost among the unselected, and "long-press to remove" is
 * an interaction nobody discovers. It also disagreed with the website, which
 * the team has been using for months.
 *
 * So the model here is the website's, feature for feature:
 *   • Selected categories are chips at the top, each with a star that sets it
 *     primary and an × that removes it.
 *   • The primary star is filled; the others are outlines.
 *   • The last remaining category cannot be removed, and removing the current
 *     primary promotes the first one left. Both mirror the server invariants
 *     (a company has exactly one primary and at least one category), so the
 *     form cannot be driven into a state the API would reject.
 *   • A search field narrows a list of the ones not yet picked.
 *
 * ── One deliberate difference from the web ─────────────────────────────────
 * The website only opens its results list once the field is focused. Here the
 * options are ALWAYS listed, before a single character is typed. On a phone,
 * a bare search box asks you to guess what is searchable; showing the list
 * first makes the choices browsable and turns typing into a filter rather than
 * a prerequisite. (Requested explicitly — "عاوز يكون قدامي اختيارات الأول".)
 */
export default function CategoryMultiSelect({
  categories,
  selectedIds,
  primaryId,
  onChange,
  max,
  disabled,
}: {
  categories: ApiAdminCategory[];
  selectedIds: string[];
  primaryId: string | null | undefined;
  onChange: (next: { categoryIds: string[]; primaryCategoryId: string | null }) => void;
  max?: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const atMax = typeof max === "number" && selectedIds.length >= max;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => !selectedSet.has(c.id))
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .slice(0, VISIBLE_OPTIONS);
  }, [categories, query, selectedSet]);

  function add(id: string) {
    if (disabled || atMax) return;
    onChange({
      categoryIds: [...selectedIds, id],
      // The first one added is the primary — the company must always have one.
      primaryCategoryId: primaryId ?? id,
    });
    setQuery("");
  }

  function remove(id: string) {
    // Never below one. The API rejects a company with no category, so the form
    // must not be able to ask for it.
    if (disabled || selectedIds.length <= 1) return;
    const rest = selectedIds.filter((c) => c !== id);
    onChange({
      categoryIds: rest,
      // Removing the primary promotes whatever is left, rather than leaving the
      // company with a primary it no longer belongs to.
      primaryCategoryId: primaryId === id ? (rest[0] ?? null) : (primaryId ?? null),
    });
  }

  function setPrimary(id: string) {
    if (disabled) return;
    onChange({ categoryIds: selectedIds, primaryCategoryId: id });
  }

  return (
    <View style={styles.wrap}>
      {selectedIds.length > 0 ? (
        <View style={styles.chips}>
          {selectedIds.map((id) => {
            const cat = byId.get(id);
            const isPrimary = primaryId === id;
            return (
              <View key={id} style={[styles.chip, isPrimary && styles.chipPrimary]}>
                <Pressable
                  onPress={() => setPrimary(id)}
                  disabled={disabled}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isPrimary }}
                  accessibilityLabel={`${cat?.label ?? id} — اجعلها الفئة الأساسية`}
                >
                  <Icon
                    name="star"
                    size={15}
                    color={isPrimary ? colors.primary : colors.outline}
                  />
                </Pressable>

                <Text style={[styles.chipText, isPrimary && styles.chipTextPrimary]} numberOfLines={1}>
                  {cat?.label ?? id}
                </Text>

                {selectedIds.length > 1 ? (
                  <Pressable
                    onPress={() => remove(id)}
                    disabled={disabled}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`إزالة ${cat?.label ?? id}`}
                  >
                    <Icon name="close" size={15} color={colors.outline} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {selectedIds.length > 0 ? (
        <Text style={styles.hint}>النجمة بتحدد الفئة الأساسية.</Text>
      ) : null}

      {!disabled ? (
        atMax ? (
          <Text style={styles.maxNotice}>وصلت لأقصى عدد فئات مسموح بيه.</Text>
        ) : (
          <>
            <View style={styles.searchWrap}>
              <Icon name="search" size={18} color={colors.outline} />
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="دوّر على فئة…"
                placeholderTextColor={colors.onSurfaceVariant}
                textAlign={textStart === "right" ? "right" : "left"}
              />
            </View>

            <View style={styles.options}>
              {options.length === 0 ? (
                <Text style={styles.empty}>مفيش فئات مطابقة.</Text>
              ) : (
                options.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onPress={() => add(c.id)}
                    style={({ pressed }) => [
                      styles.option,
                      i === options.length - 1 && styles.optionLast,
                      pressed && styles.optionPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`إضافة ${c.label}`}
                  >
                    <Text style={styles.optionText} numberOfLines={1}>
                      {c.label}
                    </Text>
                    <Icon name="add" size={18} color={colors.primary} />
                  </Pressable>
                ))
              )}
            </View>
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  chips: { flexDirection: rowStart, flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surfaceContainer,
  },
  chipPrimary: { backgroundColor: colors.primaryFixed },
  chipText: {
    flexShrink: 1,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
  },
  chipTextPrimary: { color: colors.onPrimaryFixed },
  hint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: textStart,
  },
  maxNotice: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  searchWrap: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceContainerLowest,
  },
  search: {
    flex: 1,
    paddingVertical: 11,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
  },
  options: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surfaceContainerLowest,
  },
  option: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  optionLast: { borderBottomWidth: 0 },
  optionPressed: { backgroundColor: colors.surfaceContainer },
  optionText: {
    flex: 1,
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  empty: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: textStart,
  },
});
