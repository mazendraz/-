import { apiPost } from "./api";

export type FeedbackType = "problem" | "suggestion" | "inquiry";

/** "Report a problem" / suggestion / inquiry about one company. */
export function submitFeedback(input: {
  companySlug: string;
  type: FeedbackType;
  name?: string;
  phone?: string;
  message: string;
}): Promise<unknown> {
  return apiPost("/feedback", { ...input, hp_field: "" });
}
