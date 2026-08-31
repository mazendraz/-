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
  /** From <Captcha> (phase 10) — see lib/leads.ts's submitLead for the
   *  no-op-when-unconfigured contract this matches. */
  captchaToken?: string | null;
}): Promise<ApiSiteReview> {
  return apiPost<ApiSiteReview>("/site-reviews", { ...input, hp_field: "" });
}
