import { apiPost } from "./api";

export type FeedbackType = "problem" | "suggestion" | "inquiry";

/** "Report a problem" / suggestion / inquiry about one company. */
export function submitFeedback(input: {
  companySlug: string;
  type: FeedbackType;
  name?: string;
  phone?: string;
  message: string;
  /** From <Captcha> (phase 10) — see lib/leads.ts's submitLead for the
   *  no-op-when-unconfigured contract this matches. */
  captchaToken?: string | null;
}): Promise<unknown> {
  return apiPost("/feedback", { ...input, hp_field: "" });
}
