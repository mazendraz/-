/**
 * Submitting a request — the mobile counterpart of the website's addLead() in
 * requests.ts, scoped to what a signed-in customer needs. The website's
 * version also supports the anonymous/localStorage path (no account); that
 * doesn't apply here since every customer in this app is signed in (see the
 * auth-gated tab shell). `items` (Feature C) is real here too, wired through
 * new-request/[slug].tsx's OfferingPicker — prices are never sent, only
 * {offeringId, qty, tierId}; the server reads real prices from the catalogue.
 */
import type { ApiLead } from "@alassema/core";
import { apiPost } from "./api";

export interface NewLeadInput {
  companySlug: string;
  companyName: string;
  service: string;
  name: string;
  phone: string;
  district: string;
  description: string;
  items?: { offeringId: string; qty?: number; tierId?: string | null }[];
}

export function submitLead(input: NewLeadInput): Promise<ApiLead> {
  return apiPost<ApiLead>("/leads", {
    ...input,
    // The API's schema keeps this field for leads that predate the removal
    // of budget collection from the form — the website sends "" too.
    budget: "",
    // Honeypot: real clients never populate this field name; a bot filling
    // every field it finds gets caught by it. No CAPTCHA token is sent —
    // matching the website's own fallback when no Turnstile widget renders:
    // verifyCaptcha() is a no-op server-side unless a secret is configured,
    // so this relies on the honeypot + the route's rate limit, same as the
    // website does whenever Turnstile isn't configured.
    hp_field: "",
  });
}
