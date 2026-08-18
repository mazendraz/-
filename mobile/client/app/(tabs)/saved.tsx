import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchCompany } from "../../lib/companyDetail";
import { useSavedSlugs } from "../../lib/saved";
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
      <Text style={styles.title}>المفضلة</Text>

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
  title: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "right", paddingHorizontal: 20, paddingTop: 12 },
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
});
