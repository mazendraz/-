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
}

/** Join the waiting list for a currently-busy company. */
export function joinWaitlist(slug: string, input: WaitlistInput): Promise<unknown> {
  return apiPost(`/companies/${slug}/waitlist`, { ...input, hp_field: "" });
}
