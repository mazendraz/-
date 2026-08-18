import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchLegalPages } from "../../lib/pages";

/** Terms / Privacy — the mobile counterpart of the website's LegalPage.tsx.
 *  Content is admin-managed Markdown; rendered with react-native-markdown-display
 *  (the website uses its own DOM-based Markdown.tsx, which can't be reused as-is
 *  for React Native — see the phase-9 parity notes for why this library specifically). */
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
          <Markdown style={markdownStyles} onLinkPress={(url) => { Linking.openURL(url); return false; }}>
            {content}
          </Markdown>
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
  empty: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.outline, textAlign: "center" },
});

// react-native-markdown-display styles each markdown-it token by name — this
// is its own style language, not a StyleSheet.create() call, so plain style
// objects (not RN's optimized IDs) are what it expects.
const markdownStyles = {
  body: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "right" as const, lineHeight: 26 },
  heading1: { fontFamily: "Alexandria_700Bold", fontSize: type.headline.fontSize, color: colors.onSurface, textAlign: "right" as const, marginTop: 16, marginBottom: 8 },
  heading2: { fontFamily: "Alexandria_700Bold", fontSize: type.title.fontSize, color: colors.onSurface, textAlign: "right" as const, marginTop: 14, marginBottom: 6 },
  heading3: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, textAlign: "right" as const, marginTop: 12, marginBottom: 6 },
  paragraph: { marginTop: 0, marginBottom: 12, textAlign: "right" as const },
  strong: { fontFamily: "Cairo_700Bold" },
  em: { fontStyle: "italic" as const },
  bullet_list: { marginBottom: 12 },
  ordered_list: { marginBottom: 12 },
  list_item: { flexDirection: "row-reverse" as const, marginBottom: 4 },
  link: { color: colors.primary, fontFamily: "Cairo_600SemiBold" },
  hr: { backgroundColor: colors.outlineVariant, height: 1, marginVertical: 16 },
};
