import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import MenuButton from "../../components/MenuButton";
import Logo from "../../components/Logo";
import { fetchCompany } from "../../lib/companyDetail";
import { toggleSaved, useSavedSlugs } from "../../lib/saved";
import { useRequireAccount } from "../../lib/authGate";
import { useRefreshOnFocus, assetUri, rowStart, displayLine } from "@alassema/mobile-shared";

/**
 * Saved companies — reads the device-local list (lib/saved.ts) and resolves
 * each slug to a real company. A handful of individual GET /companies/[slug]
 * calls rather than one bulk request: there's no "slugs in" filter on the
 * list endpoint, and a shortlist is small by nature (this mirrors how the
 * website's own Saved page works against the same kind of device list).
 *
 * Gated behind an account (phase 1) even though the underlying list is
 * device-local, not account data — matches the confirmed product decision to
 * keep this tab, like Requests/Messages/Account, for signed-in customers.
 */
export default function Saved() {
  const customer = useRequireAccount("/saved");
  const slugs = useSavedSlugs();
  const [companies, setCompanies] = useState<Record<string, ApiCompany | null>>({});
  // Missing before — the website's Saved.tsx filters the shortlist by
  // name/category once there's more than a couple of entries.
  const [query, setQuery] = useState("");

  useEffect(() => {
    slugs.forEach((slug) => {
      if (slug in companies) return;
      fetchCompany(slug)
        .then((c) => setCompanies((prev) => ({ ...prev, [slug]: c })))
        .catch(() => setCompanies((prev) => ({ ...prev, [slug]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs]);

  // The effect above only resolves slugs it has never seen — correct for
  // adding one, useless for an edit. Coming back to this tab re-resolves the
  // whole shortlist, so a company that changed name, logo, rating or
  // availability on the website is current here too.
  useRefreshOnFocus(() => {
    slugs.forEach((slug) => {
      fetchCompany(slug)
        .then((c) => setCompanies((prev) => ({ ...prev, [slug]: c })))
        // Unlike the first resolve, a failed REFRESH keeps the card that is
        // already on screen instead of writing null and making it disappear.
        .catch(() => {});
    });
  });

  if (!customer) return null;

  const rows = slugs.map((slug) => companies[slug]).filter((c): c is ApiCompany => Boolean(c));

  // Same fields the website's Saved.tsx matches against (name, category).
  const q = query.trim().toLowerCase();
  const visibleRows = q
    ? rows.filter((c) => [c.name, c.categoryLabel].some((v) => v.toLowerCase().includes(q)))
    : rows;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarStart}>
          <Logo size={28} />
          <Text style={styles.title}>المفضلة</Text>
        </View>
        <View style={styles.topBarActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="بحث" onPress={() => router.push("/search")} hitSlop={8}>
            <Icon name="search" size={22} color={colors.onSurface} />
          </Pressable>
          <MenuButton size={22} />
        </View>
      </View>

      {rows.length > 0 && (
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.outline} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="دوّر في المفضلة"
            placeholderTextColor={colors.outline}
            style={styles.searchInput}
            textAlign="right"
          />
        </View>
      )}

      <FlatList
        data={visibleRows}
        keyExtractor={(c) => c.slug}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          slugs.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="favorite" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش حاجة محفوظة لسه</Text>
              {/* Copy kept in step with lib/saved.ts. Favorites used to be an
                  AsyncStorage list and this line correctly said so; they are
                  ACCOUNT data now (api's CustomerFavorite, mirrored into the
                  cache), and this screen is behind useRequireAccount, so every
                  reader of this sentence is signed in. Left as it was, it told
                  the customer the exact opposite of what the app now does. */}
              <Text style={styles.emptyBody}>
                احفظ شركة من صفحتها عشان تلاقيها هنا بسرعة. المفضلة محفوظة على حسابك،
                فهتلاقيها زي ما هي على أي جهاز تدخل منه.
              </Text>
            </View>
          ) : rows.length > 0 && visibleRows.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="search" size={40} color={colors.outline} />
              <Text style={styles.emptyBody}>مفيش نتايج مطابقة.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Image source={{ uri: assetUri(item.logo) }} style={styles.logo} />
            <View style={styles.cardText}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.category} numberOfLines={1}>{item.categoryLabel}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                <Text style={styles.ratingStar}>★</Text>
                <Text style={styles.reviewCount}>({item.reviewCount})</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  void toggleSaved(item.slug);
                }}
                hitSlop={10}
                style={styles.unsaveBtn}
                accessibilityRole="button"
                accessibilityLabel="إزالة من المفضلة"
              >
                <Icon name="favorite" size={20} color={colors.error} />
              </Pressable>
              {/* Missing before — the website's Saved.tsx has a direct
                  "request" button per card (common_request), this screen
                  only let you open the company profile first. */}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  router.push({ pathname: "/new-request/[slug]", params: { slug: item.slug, name: item.name } });
                }}
                hitSlop={6}
                style={styles.requestBtn}
              >
                <Text style={styles.requestBtnText}>اطلب</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12 },
  topBarStart: { flexDirection: rowStart, alignItems: "center", gap: 8 },
  // Groups the header's trailing actions so the global menu sits beside the
  // existing search icon instead of being spread apart by space-between.
  topBarActions: { flexDirection: rowStart, alignItems: "center", gap: 14 },
  title: { fontSize: type.headline.fontSize, lineHeight: displayLine(type.headline.fontSize), fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "right" },
  searchRow: {
    flexDirection: rowStart,
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
  listContent: { padding: 20, gap: 10, flexGrow: 1 },
  empty: { alignItems: "center", gap: 6, paddingTop: 80 },
  emptyTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  emptyBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "center" },
  card: { flexDirection: rowStart, alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.outlineVariant },
  cardPressed: { opacity: 0.7 },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  cardText: { flex: 1 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  category: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right" },
  ratingRow: { flexDirection: rowStart, alignItems: "center", gap: 3, marginTop: 4 },
  ratingText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  ratingStar: { fontSize: type.caption.fontSize, color: "#f59e0b" },
  reviewCount: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  cardActions: { alignItems: "center", gap: 6 },
  unsaveBtn: { padding: 4 },
  requestBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  requestBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimary },
});
