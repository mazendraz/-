import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { reviewProject, fetchPendingProjects, type ModerationProject } from "../../../lib/approvals";
import { projectQueue } from "../../../lib/approvalsStore";
import PhotoPreview from "../../../components/PhotoPreview";
import ApproveRejectBar from "../../../components/ApproveRejectBar";
import WaitingFor from "../../../components/WaitingFor";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

/** No single-project GET route exists (see phase-9's API table) — read the
 *  item back from the moderation-queue LIST, same "list is the only read"
 *  pattern lib/offerings.ts's editor screen already established in phase 7. */
export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<ModerationProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const page = await fetchPendingProjects({ pageSize: 100 });
      const found = page.data.find((p) => p.id === id);
      if (!found) throw new ApiError(404, "المشروع مش لاقيه — يمكن اتراجع بالفعل.");
      setProject(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المشروع. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(status: "APPROVED" | "REJECTED") {
    if (!project || busy) return;
    setBusy(true);
    try {
      await reviewProject(project.id, status);
      projectQueue.removeItem(project.id);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تنفيذ الإجراء. جرّب تاني.");
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "مشروع في معرض الأعمال" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : error && !project ? (
          <ErrorCard message={error} onRetry={load} />
        ) : project ? (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <PhotoPreview uri={project.img} />
              <View style={styles.header}>
                <Text style={styles.title}>{project.title}</Text>
                {project.createdAt ? <WaitingFor createdAt={project.createdAt} /> : null}
              </View>
              <Text style={styles.company}>{project.companyName}</Text>
              <Text style={styles.year}>{project.year}</Text>
              {project.description ? <Text style={styles.description}>{project.description}</Text> : null}
              {error ? <ErrorCard message={error} /> : null}
            </ScrollView>

            <View style={styles.actionsBar}>
              <ApproveRejectBar busy={busy} onApprove={() => decide("APPROVED")} onReject={() => decide("REJECTED")} />
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  company: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  year: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  description: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, lineHeight: 22 },
  actionsBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface },
});
