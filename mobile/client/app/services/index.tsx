import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCategory } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchCategories } from "../../lib/categories";
import { ApiError } from "@alassema/mobile-shared";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";
import { assetUri } from "../../lib/assetUrl";

/** All service categories to browse — the mobile counterpart of Services.tsx. */
export default function Services() {
  const [categories, setCategories] = useState<ApiCategory[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    fetchCategories()
      .then((all) => {
        setCategories(all);
        setError("");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الخدمات."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A category added, renamed or removed from the website's admin shows up on
  // the next visit to this screen instead of only after an app restart.
  useRefreshOnFocus(load);

  const q = query.trim().toLowerCase();
  const filtered = (categories ?? []).filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_back" size={22} color={colors.onSurface} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={styles.title}>الخدمات</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.outline} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="دوّر على خدمة"
          placeholderTextColor={colors.outline}
          style={styles.searchInput}
          textAlign="right"
        />
      </View>

      {error !== "" && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.slug}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: "/services/[slug]", params: { slug: item.slug } })}
          >
            <Image source={{ uri: assetUri(item.cover) }} style={styles.cover} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.label}</Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.countChip}>
                <Text style={styles.countText}>{item.count} شركة موثّقة</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 10 },
  title: { fontFamily: "Alexandria_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.surfaceContainer, borderRadius: 12, marginHorizontal: 20, paddingHorizontal: 14, marginBottom: 12 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurface, paddingVertical: 10 },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.error, textAlign: "center", marginBottom: 8 },
  list: { padding: 20, gap: 14 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.outlineVariant },
  cover: { width: "100%", height: 120, backgroundColor: colors.surfaceContainer },
  cardBody: { padding: 14, gap: 4 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right" },
  countChip: { alignSelf: "flex-end", backgroundColor: colors.surfaceContainer, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  countText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.outline },
});
