import type { ApiReview } from "@alassema/core";
import { apiPost } from "@alassema/mobile-shared";

export function submitReview(leadId: string, rating: number, text?: string): Promise<ApiReview> {
  return apiPost<ApiReview>(`/customer/leads/${leadId}/review`, { rating, text });
}
