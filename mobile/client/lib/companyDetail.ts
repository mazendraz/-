import type { ApiCompany, ApiWaitlistEntry } from "@alassema/core";
import { apiGet, apiPost } from "./api";

/** Full company profile — about, gallery, projects, reviews, availability. */
export function fetchCompany(slug: string): Promise<ApiCompany> {
  return apiGet<ApiCompany>(`/companies/${slug}`);
}

/**
 * A request sent to a company that is currently booked out. Deliberately the
 * same shape as submitLead's payload minus companySlug/companyName: the customer
 * fills the SAME form either way, and everything here is carried onto the real
 * Lead verbatim when the provider accepts the entry (see the API's
 * waitlist.service.ts convertToLead). Anything dropped here is a detail the
 * customer typed that the provider would never see.
 */
export interface WaitlistInput {
  name: string;
  phone: string;
  service?: string;
  /** The description of the job. Named for the column it has always written. */
  note?: string;
  district?: string;
  budget?: string;
  /** Prices are never sent — the server reads them from the catalogue. */
  items?: { offeringId: string; qty?: number; tierId?: string | null }[];
  /** From <Captcha> (phase 10) — api's companies/[slug]/waitlist route
   *  verifies this the same way /leads and /feedback do; found via grep
   *  over every route calling verifyCaptcha(), not in the phase-10 prompt's
   *  own list of three endpoints. */
  captchaToken?: string | null;
}

/** Queue a finished request on a currently-busy company's waiting list. */
export function joinWaitlist(slug: string, input: WaitlistInput): Promise<ApiWaitlistEntry> {
  return apiPost<ApiWaitlistEntry>(`/companies/${slug}/waitlist`, { ...input, hp_field: "" });
}
