import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import { fetchCompany } from "../../lib/companyDetail";
import { toggleSaved, useSavedSlugs } from "../../lib/saved";
import { useRequireAccount } from "../../lib/authGate";

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

  useEffect(() => {
    slugs.forEach((slug) => {
      if (slug in companies) return;
      fetchCompany(slug)
        .then((c) => setCompanies((prev) => ({ ...prev, [slug]: c })))
        .catch(() => setCompanies((prev) => ({ ...prev, [slug]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs]);

  if (!customer) return null;

  const rows = slugs.map((slug) => companies[slug]).filter((c): c is ApiCompany => Boolean(c));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarStart}>
          <Logo size={28} />
          <Text style={styles.title}>المفضلة</Text>
        </View>
        <Pressable onPress={() => router.push("/search")} hitSlop={8}>
          <Icon name="search" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(c) => c.slug}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          slugs.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="favorite" size={40} color={colors.outline} />
              <Text style={styles.emptyTitle}>مفيش حاجة محفوظة لسه</Text>
              <Text style={styles.emptyBody}>احفظ شركة من صفحتها عشان تلاقيها هنا بسرعة.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Image source={{ uri: item.logo }} style={styles.logo} />
            <View style={styles.cardText}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.category} numberOfLines={1}>{item.categoryLabel}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                <Text style={styles.ratingStar}>★</Text>
                <Text style={styles.reviewCount}>({item.reviewCount})</Text>
              </View>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                void toggleSaved(item.slug);
              }}
              hitSlop={10}
              style={styles.unsaveBtn}
            >
              <Icon name="favorite" size={20} color={colors.error} />
            </Pressable>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12 },
  topBarStart: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  title: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "right" },
  listContent: { padding: 20, gap: 10, flexGrow: 1 },
  empty: { alignItems: "center", gap: 6, paddingTop: 80 },
  emptyTitle: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  emptyBody: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "center" },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.outlineVariant },
  cardPressed: { opacity: 0.7 },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  cardText: { flex: 1 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  category: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right" },
  ratingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 3, marginTop: 4 },
  ratingText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  ratingStar: { fontSize: type.caption.fontSize, color: "#f59e0b" },
  reviewCount: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  unsaveBtn: { padding: 4 },
});
