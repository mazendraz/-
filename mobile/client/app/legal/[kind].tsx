import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchLegalPages } from "../../lib/pages";

/** Terms / Privacy — the mobile counterpart of the website's LegalPage.tsx.
 *  Content is admin-managed plain text; rendered as-is (no HTML/Markdown
 *  parsing here — the backend already strips HTML on save). */
export default function LegalPage() {
  const { kind } = useLocalSearchParams<{ kind: "terms" | "privacy" }>();
  const title = kind === "terms" ? "الشروط والأحكام" : "سياسة الخصوصية";
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetchLegalPages()
      .then((p) => setContent(kind === "terms" ? p.terms : p.privacy))
      .catch(() => setContent(""));
  }, [kind]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_back" size={22} color={colors.onSurface} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {content === null ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : content.trim() ? (
          <Text style={styles.body}>{content}</Text>
        ) : (
          <Text style={styles.empty}>المحتوى ده لسه متوفرش.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  scroll: { padding: 20, paddingTop: 4 },
  loading: { marginTop: 40 },
  body: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 26 },
  empty: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.outline, textAlign: "center" },
});
