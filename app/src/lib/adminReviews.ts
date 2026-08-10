// Admin moderation of customer→company reviews. Customer reviews start unapproved
// (hidden + excluded from the rating) until approved here. Approving/deleting
// recomputes the company's rating aggregate server-side.
import { apiGet, apiPatch, apiDelete } from "./api";

export type AdminReviewStatus = "pending" | "approved";

export interface AdminReview {
  id?: string;
  author: string;
  avatar: string;
  rating: number;
  text: string;
  date: string;
  district: string;
  verified: boolean;
  approved: boolean;
  companyId: string;
  companyName: string;
  companySlug: string;
}

export interface AdminReviewPage {
  data: AdminReview[];
  meta: { total: number; page: number; pageSize: number };
}

/**
 * One page of the moderation queue.
 *
 * The endpoint used to return a bare array capped at 200 with no total, so a
 * backlog past that was invisible — to the admin AND to the public, since
 * unapproved reviews stay hidden. `meta.total` is the number that was actually
 * missing: it lets the queue say how much work is waiting, not just show a
 * screenful of it.
 */
export function listAdminReviews(
  status?: AdminReviewStatus,
  page = 1,
  pageSize = 50,
): Promise<AdminReviewPage> {
  const sp = new URLSearchParams();
  if (status) sp.set("status", status);
  sp.set("page", String(page));
  sp.set("pageSize", String(pageSize));
  return apiGet<AdminReviewPage>(`/admin/reviews?${sp.toString()}`);
}

export function approveAdminReview(reviewId: string): Promise<AdminReview> {
  return apiPatch<AdminReview>(`/admin/reviews/${reviewId}`, { approved: true });
}

export function deleteAdminReview(reviewId: string): Promise<void> {
  return apiDelete(`/admin/reviews/${reviewId}`);
}
