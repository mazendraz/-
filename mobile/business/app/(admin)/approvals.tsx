import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import { textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import type { ApiFeedback, ApiSiteReview } from "@alassema/core";
import type { ApprovalQueue } from "../../lib/approvals";
import { CHANGE_ENTITY_LABEL, FEEDBACK_TYPE_LABEL, type AdminReviewItem, type ModerationProject } from "../../lib/approvals";
import type { ApiChangeRequest } from "../../lib/profile";
import {
  changeRequestQueue,
  projectQueue,
  reviewQueue,
  siteReviewQueue,
  feedbackQueue,
  refreshAllQueues,
} from "../../lib/approvalsStore";
import QueueSegments from "../../components/QueueSegments";
import ApprovalRow from "../../components/ApprovalRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const EMPTY_COPY: Record<ApprovalQueue, { title: string; message: string }> = {
  changeRequest: { title: "مفيش طلبات تعديل معلّقة", message: "كل التعديلات اتراجعت." },
  project: { title: "مفيش مشاريع معلّقة", message: "كل صور معرض الأعمال اتراجعت." },
  review: { title: "مفيش تقييمات معلّقة", message: "كل تقييمات العملاء اتراجعت." },
  siteReview: { title: "مفيش آراء عملاء معلّقة", message: "كل الآراء المرسلة ظاهرة أو اتراجعت." },
  feedback: { title: "مفيش رسائل جديدة", message: "كل الرسائل اتقرت." },
};

export default function AdminApprovals() {
  const cr = changeRequestQueue.use();
  const pr = projectQueue.use();
  const rv = reviewQueue.use();
  const sr = siteReviewQueue.use();
  const fb = feedbackQueue.use();

  const [active, setActive] = useState<ApprovalQueue | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    refreshAllQueues().finally(() => setInitialLoad(false));
  }, []);

  useRefreshOnFocus(() => {
    void refreshAllQueues();
  });

  // Default to the queue with the oldest waiting item, once every queue's
  // first fetch has settled — task 9.3. Only runs once; after that the
  // admin's own tap (`onSelect`) owns `active`.
  useEffect(() => {
    if (active !== null || initialLoad) return;
    const oldest = ([
      ["changeRequest", cr.items[cr.items.length - 1]?.createdAt],
      ["project", pr.items[pr.items.length - 1]?.createdAt],
      ["review", rv.items[rv.items.length - 1]?.createdAt],
      ["siteReview", sr.items[sr.items.length - 1]?.createdAt],
      ["feedback", fb.items[fb.items.length - 1]?.createdAt],
    ] as [ApprovalQueue, number | undefined][])
      .filter((entry): entry is [ApprovalQueue, number] => entry[1] != null)
      .sort((a, b) => a[1] - b[1])[0];
    setActive(oldest?.[0] ?? "changeRequest");
  }, [active, initialLoad, cr.items, pr.items, rv.items, sr.items, fb.items]);

  const counts: Record<ApprovalQueue, number> = {
    changeRequest: cr.total,
    project: pr.total,
    review: rv.total,
    siteReview: sr.total,
    feedback: fb.total,
  };

  const current = active ?? "changeRequest";
  const state = { changeRequest: cr, project: pr, review: rv, siteReview: sr, feedback: fb }[current];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <QueueSegments active={current} counts={counts} onSelect={setActive} />

      {current === "siteReview" ? (
        <Pressable style={styles.settingsLink} onPress={() => router.push("/approvals/site-review-settings")}>
          <Text style={styles.settingsLinkText}>إعدادات استقبال الآراء ›</Text>
        </Pressable>
      ) : null}

      {initialLoad || state.loading && state.items.length === 0 ? (
        <ListSkeleton />
      ) : state.error && state.items.length === 0 ? (
        <ErrorCard message={state.error} onRetry={() => queueRefresh(current)} />
      ) : state.items.length === 0 ? (
        <EmptyCard title={EMPTY_COPY[current].title} message={EMPTY_COPY[current].message} />
      ) : (
        <FlatList
          data={state.items as { id: string }[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <QueueItemRow queue={current} item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

function queueRefresh(queue: ApprovalQueue): void {
  ({ changeRequest: changeRequestQueue, project: projectQueue, review: reviewQueue, siteReview: siteReviewQueue, feedback: feedbackQueue }[queue]).refresh();
}

function QueueItemRow({ queue, item }: { queue: ApprovalQueue; item: unknown }) {
  if (queue === "changeRequest") {
    const r = item as ApiChangeRequest;
    return (
      <ApprovalRow
        title={`${CHANGE_ENTITY_LABEL[r.entity]} · ${OPERATION_LABEL[r.operation]}`}
        subtitle={r.companyName ?? r.companyId}
        createdAt={r.createdAt}
        onPress={() => router.push(`/approvals/change-request/${r.id}`)}
      />
    );
  }
  if (queue === "project") {
    const p = item as ModerationProject;
    return (
      <ApprovalRow
        title={p.title}
        subtitle={p.companyName}
        createdAt={p.createdAt ?? Date.now()}
        onPress={() => router.push(`/approvals/project/${p.id}`)}
      />
    );
  }
  if (queue === "review") {
    const r = item as AdminReviewItem;
    return (
      <ApprovalRow
        title={`${r.author} — ${r.rating}★`}
        subtitle={r.companyName}
        createdAt={r.createdAt ?? Date.now()}
        onPress={() => router.push(`/approvals/review/${r.id}`)}
      />
    );
  }
  if (queue === "siteReview") {
    const s = item as ApiSiteReview;
    return (
      <ApprovalRow
        title={`${s.name} — ${s.rating}★`}
        subtitle={s.text}
        createdAt={s.createdAt}
        onPress={() => router.push(`/approvals/site-review/${s.id}`)}
      />
    );
  }
  const f = item as ApiFeedback;
  return (
    <ApprovalRow
      title={`${FEEDBACK_TYPE_LABEL[f.type]} — ${f.companyName}`}
      subtitle={f.message}
      createdAt={f.createdAt}
      onPress={() => router.push(`/approvals/feedback/${f.id}`)}
    />
  );
}

const OPERATION_LABEL: Record<ApiChangeRequest["operation"], string> = {
  PUBLISH: "طلب نشر",
  UPDATE: "طلب تعديل",
  DELETE: "طلب حذف",
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  settingsLink: { paddingHorizontal: 16, paddingBottom: 8 },
  settingsLinkText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart },
  list: { padding: 16, paddingTop: 4 },
  separator: { height: 10 },
});
