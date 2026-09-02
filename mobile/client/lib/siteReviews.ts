import type { ApiSiteReview, ApiSiteReviewSettings } from "@alassema/core";
import { apiGet, apiPost } from "@alassema/mobile-shared";

/** Homepage testimonials — general site reviews, not tied to one company. */
export function fetchSiteReviews(): Promise<ApiSiteReview[]> {
  return apiGet<ApiSiteReview[]>("/site-reviews");
}

export function fetchSiteReviewSettings(): Promise<ApiSiteReviewSettings> {
  return apiGet<ApiSiteReviewSettings>("/site-reviews/settings");
}

export function submitSiteReview(input: {
  name: string;
  district: string;
  rating: number;
  text: string;
}): Promise<ApiSiteReview> {
  return apiPost<ApiSiteReview>("/site-reviews", { ...input, hp_field: "" });
}
