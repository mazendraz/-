import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import type { ApiProject } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchCompanyDetail, addCompanyProject } from "../../../lib/adminCompanies";
import { deleteProject } from "../../../lib/approvals";
import { uploadAdminImage } from "../../../lib/adminUpload";
import Button from "../../../components/Button";
import ProjectCard from "../../../components/ProjectCard";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../../components/ListStates";

export default function CompanyProjects() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [projects, setProjects] = useState<ApiProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setError(null);
    try {
      const company = await fetchCompanyDetail(id);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCompanyName(company.name);
      setProjects(company.projects);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المعرض. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("محتاجين إذن الصور", "من غير إذن الوصول للصور مش هنقدر نرفع صورة.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPickedUri(asset.uri);
    setPickedFile({ uri: asset.uri, name: asset.fileName ?? `project-${Date.now()}.jpg`, type: asset.mimeType ?? "image/jpeg" });
  }

  const canSubmit = Boolean(pickedFile) && title.trim().length > 0 && year.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !pickedFile || !id) return;
    setSubmitting(true);
    try {
      const url = await uploadAdminImage("projects", pickedFile);
      const created = await addCompanyProject(id, { title: title.trim(), img: url, description: description.trim(), year: year.trim() });
      setProjects((prev) => [created, ...(prev ?? [])]);
      setPickedUri(null);
      setPickedFile(null);
      setTitle("");
      setDescription("");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر رفع المشروع. جرّب تاني.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(project: ApiProject) {
    if (!project.id) return;
    Alert.alert("حذف المشروع", `هل تريد حذف "${project.title}" من المعرض؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProject(project.id!);
            setProjects((prev) => prev?.filter((p) => p.id !== project.id) ?? null);
          } catch (err) {
            Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `معرض ${companyName}` }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.form}>
              <Text style={styles.formTitle}>إضافة مشروع للمعرض</Text>
              <Text style={styles.formHint}>مشاريع الأدمن بتتنشر مباشرة، من غير ما تستنى مراجعة.</Text>

              <Pressable style={styles.pickBtn} onPress={pickImage}>
                {pickedUri ? (
                  <Image source={{ uri: pickedUri }} style={styles.preview} contentFit="cover" />
                ) : (
                  <Text style={styles.pickLabel}>اختر صورة</Text>
                )}
              </Pressable>

              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="اسم المشروع" placeholderTextColor={colors.onSurfaceVariant} />
              <TextInput style={styles.input} value={year} onChangeText={(v) => setYear(v.replace(/[^0-9]/g, ""))} placeholder="السنة" placeholderTextColor={colors.onSurfaceVariant} keyboardType="number-pad" />
              <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="وصف مختصر (اختياري)" placeholderTextColor={colors.onSurfaceVariant} multiline />

              <Button label={submitting ? "بيترفع..." : "إضافة للمعرض"} onPress={handleSubmit} busy={submitting} disabled={!canSubmit} />
            </View>

            {projects && projects.length > 0 ? (
              <View style={styles.grid}>
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} onDelete={() => handleDelete(p)} />
                ))}
              </View>
            ) : (
              <EmptyCard title="لسه مفيش مشاريع" message="ضيف أول مشروع من الفورم فوق." />
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16 },
  form: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 16, gap: 10 },
  formTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  formHint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant },
  pickBtn: {
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  preview: { width: "100%", height: "100%" },
  pickLabel: { fontFamily: "Cairo_600SemiBold", fontSize: type.body.fontSize, color: colors.onSurfaceVariant },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  grid: { gap: 12 },
});
