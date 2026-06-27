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

export function listAdminReviews(status?: AdminReviewStatus): Promise<AdminReview[]> {
  return apiGet<AdminReview[]>(`/admin/reviews${status ? `?status=${status}` : ""}`);
}

export function approveAdminReview(reviewId: string): Promise<AdminReview> {
  return apiPatch<AdminReview>(`/admin/reviews/${reviewId}`, { approved: true });
}

export function deleteAdminReview(reviewId: string): Promise<void> {
  return apiDelete(`/admin/reviews/${reviewId}`);
}
