/**
 * Submitting a request — the mobile counterpart of the website's addLead() in
 * requests.ts, scoped to what a signed-in customer needs. The website's
 * version also supports the anonymous/localStorage path (no account); that
 * doesn't apply here since every customer in this app is signed in (see the
 * auth-gated tab shell). `items` (Feature C) is real here too, wired through
 * new-request/[slug].tsx's OfferingPicker — prices are never sent, only
 * {offeringId, qty, tierId}; the server reads real prices from the catalogue.
 */
import type { ApiLead, ApiLeadVerificationPayload } from "@alassema/core";
import { apiPost } from "./api";
import { rememberLeadToken, getLeadToken } from "./leadTokens";

export interface NewLeadInput {
  companySlug: string;
  companyName: string;
  service: string;
  name: string;
  phone: string;
  district: string;
  description: string;
  items?: { offeringId: string; qty?: number; tierId?: string | null }[];
  /** From <Captcha> (phase 10) — undefined/null whenever the widget isn't
   *  configured, matching the website's own fallback: verifyCaptcha() is a
   *  no-op server-side unless a secret is set, so the honeypot + rate limit
   *  alone cover that case. */
  captchaToken?: string | null;
}

export async function submitLead(input: NewLeadInput): Promise<ApiLead> {
  const lead = await apiPost<ApiLead>("/leads", {
    ...input,
    // The API's schema keeps this field for leads that predate the removal
    // of budget collection from the form — the website sends "" too.
    budget: "",
    // Honeypot: real clients never populate this field name; a bot filling
    // every field it finds gets caught by it.
    hp_field: "",
  });
  // The creation response is the ONLY place the server ever includes
  // trackingToken — save it now or it's gone for good (see leadTokens.ts).
  if (lead.trackingToken) void rememberLeadToken(lead.refNumber, lead.trackingToken);
  return lead;
}

export interface VerifyLeadInput {
  ref: string;
  /** This device's own phone-on-file fallback — only effective for a legacy
   *  lead with no trackingToken; see leadTokens.ts for why. */
  phone: string;
  decision: "confirmed" | "discrepancy";
  clientAmount?: number;
  note?: string;
}

/** Confirm or dispute a completed lead's final amount — see
 *  components/PriceVerificationGate.tsx, the only caller. */
export async function verifyLeadAmount(input: VerifyLeadInput): Promise<ApiLead> {
  const token = await getLeadToken(input.ref);
  const payload: ApiLeadVerificationPayload = {
    ref: input.ref,
    token,
    phone: token ? undefined : input.phone,
    decision: input.decision,
    clientAmount: input.clientAmount,
    note: input.note,
  };
  return apiPost<ApiLead>("/leads/verify", payload);
}
