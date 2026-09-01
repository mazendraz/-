/**
 * One independent store per moderation queue — task 9.2. Each holds its own
 * items/total/fetchedAt, so the "الموافقات" tab badge (pending counts) and
 * the approvals screen itself (item lists) read from the same place without
 * either one forcing a refetch the other didn't ask for. Same
 * useSyncExternalStore convention as lib/liveBadges.ts — no Redux/Zustand
 * in this app.
 */
import { useSyncExternalStore } from "react";
import type { ApiFeedback, ApiPage, ApiSiteReview } from "@alassema/core";
import { ApiError } from "@alassema/mobile-shared";
import type { ApiChangeRequest } from "./profile";
import {
  fetchPendingChangeRequests,
  fetchPendingProjects,
  fetchPendingReviews,
  fetchPendingSiteReviews,
  fetchPendingFeedback,
  type ModerationProject,
  type AdminReviewItem,
} from "./approvals";

interface QueueState<T> {
  items: T[];
  total: number;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

function makeQueueStore<T extends { id: string }>(fetcher: () => Promise<ApiPage<T>>) {
  let state: QueueState<T> = { items: [], total: 0, loading: false, error: null, fetchedAt: null };
  const listeners = new Set<() => void>();

  function notify(): void {
    listeners.forEach((l) => l());
  }

  function getSnapshot(): QueueState<T> {
    return state;
  }

  async function refresh(): Promise<void> {
    state = { ...state, loading: true, error: null };
    notify();
    try {
      const result = await fetcher();
      state = { items: result.data, total: result.meta.total, loading: false, error: null, fetchedAt: Date.now() };
    } catch (err) {
      state = { ...state, loading: false, error: err instanceof ApiError ? err.message : "تعذّر التحميل." };
    }
    notify();
  }

  /** Optimistic removal after an approve/reject/delete action — task 9.10.
   *  Callers that need rollback keep their own copy of the item before
   *  calling this and re-insert it (or just call refresh()) on failure. */
  function removeItem(id: string): void {
    if (!state.items.some((i) => i.id === id)) return;
    state = { ...state, items: state.items.filter((i) => i.id !== id), total: Math.max(0, state.total - 1) };
    notify();
  }

  function use(): QueueState<T> {
    return useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot,
      getSnapshot,
    );
  }

  return { refresh, removeItem, use, getSnapshot };
}

export const changeRequestQueue = makeQueueStore<ApiChangeRequest>(fetchPendingChangeRequests);
export const projectQueue = makeQueueStore<ModerationProject>(fetchPendingProjects);
export const reviewQueue = makeQueueStore<AdminReviewItem>(fetchPendingReviews);
export const siteReviewQueue = makeQueueStore<ApiSiteReview>(fetchPendingSiteReviews);
export const feedbackQueue = makeQueueStore<ApiFeedback>(fetchPendingFeedback);

const ALL_QUEUES = [changeRequestQueue, projectQueue, reviewQueue, siteReviewQueue, feedbackQueue] as const;

export function refreshAllQueues(): Promise<void[]> {
  return Promise.all(ALL_QUEUES.map((q) => q.refresh()));
}

/** Total pending across every queue — the "الموافقات" tab badge. */
export function useTotalPendingApprovals(): number {
  const cr = changeRequestQueue.use();
  const pr = projectQueue.use();
  const rv = reviewQueue.use();
  const sr = siteReviewQueue.use();
  const fb = feedbackQueue.use();
  return cr.total + pr.total + rv.total + sr.total + fb.total;
}
