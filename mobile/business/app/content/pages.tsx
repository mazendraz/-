import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiLegalPages } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchLegalPages, updateLegalPages } from "../../lib/adminContent";
import Button from "../../components/Button";
import MarkdownEditor from "../../components/MarkdownEditor";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function LegalPages() {
  const [pages, setPages] = useState<ApiLegalPages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLegalPages()
      .then(setPages)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الصفحات."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!pages || saving) return;
    setSaving(true);
    try {
      const updated = await updateLegalPages(pages);
      setPages(updated);
      Alert.alert("تم الحفظ", "اتحفظت الصفحات القانونية.");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "الصفحات القانونية" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} />
        ) : pages ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.label}>الشروط والأحكام</Text>
              <MarkdownEditor value={pages.terms} onChange={(v) => setPages({ ...pages, terms: v })} />
            </View>
            <View>
              <Text style={styles.label}>سياسة الخصوصية</Text>
              <MarkdownEditor value={pages.privacy} onChange={(v) => setPages({ ...pages, privacy: v })} />
            </View>
            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  label: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginBottom: 8, textAlign: textStart },
});
