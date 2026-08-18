import type { ApiCompany } from "@alassema/core";
import { apiGet, apiPost } from "./api";

/** Full company profile — about, gallery, projects, reviews, availability. */
export function fetchCompany(slug: string): Promise<ApiCompany> {
  return apiGet<ApiCompany>(`/companies/${slug}`);
}

export interface WaitlistInput {
  name: string;
  phone: string;
  service?: string;
  note?: string;
  /** From <Captcha> (phase 10) — api's companies/[slug]/waitlist route
   *  verifies this the same way /leads and /feedback do; found via grep
   *  over every route calling verifyCaptcha(), not in the phase-10 prompt's
   *  own list of three endpoints. */
  captchaToken?: string | null;
}

/** Join the waiting list for a currently-busy company. */
export function joinWaitlist(slug: string, input: WaitlistInput): Promise<unknown> {
  return apiPost(`/companies/${slug}/waitlist`, { ...input, hp_field: "" });
}
