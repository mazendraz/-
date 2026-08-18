import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import { fetchCompanies } from "../../lib/companies";
import { ApiError } from "../../lib/api";

/**
 * Browse companies and start a request — the entry point the app was missing
 * entirely: without this, a signed-in customer could see requests but had no
 * way to CREATE one, which is the whole point of a lead-gen product.
 *
 * Deliberately NOT a full company profile (gallery, offerings catalog,
 * reviews, availability) — that's real scope the website's CompanyProfile.tsx
 * covers and this doesn't yet. This is the minimal real path: search, pick a
 * company, tell them what you need. Debounced search rather than a submit
 * button, matching the instant-filter feel of the website's catalog.
 */
export default function Companies() {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<ApiCompany[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (search: string) => {
    setError("");
    try {
      const page = await fetchCompanies(search);
      setCompanies(page.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الشركات.");
    }
  }, []);

  // Debounced: a search request per keystroke would hit the endpoint on every
  // character typed. 350ms matches the website's SearchInput.
  useEffect(() => {
    const id = setTimeout(() => load(query), 350);
    return () => clearTimeout(id);
  }, [query, load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <Logo size={28} />
        <Text style={styles.title}>الشركات</Text>
      </View>

      <View style={styles.searchRow}>
        <Icon name="search" size={18} color={colors.outline} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="دوّر على شركة أو خدمة"
          placeholderTextColor={colors.outline}
          style={styles.searchInput}
          textAlign="right"
        />
      </View>

      {error !== "" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={companies ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          companies !== null ? (
            <Text style={styles.empty}>مفيش نتايج</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })
            }
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Image source={{ uri: item.logo }} style={styles.logo} />
            <View style={styles.cardText}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.category} numberOfLines={1}>{item.categoryLabel}</Text>
            </View>
            <Icon name="arrow_back" size={18} color={colors.outline} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "right",
  },
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  errorBanner: { backgroundColor: colors.errorContainer, marginHorizontal: 20, marginTop: 10, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  listContent: { padding: 20, gap: 10, flexGrow: 1 },
  empty: { textAlign: "center", color: colors.outline, fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, paddingTop: 60 },
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardPressed: { opacity: 0.7 },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  cardText: { flex: 1 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  category: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right" },
});
