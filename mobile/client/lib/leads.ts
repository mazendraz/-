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
import { apiPost } from "@alassema/mobile-shared";
import { rememberLeadToken } from "./leadTokens";

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
  leadId: string;
  decision: "confirmed" | "discrepancy";
  clientAmount?: number;
  note?: string;
}

/**
 * Confirm or dispute a completed lead's final amount — see
 * components/PriceVerificationGate.tsx, the only caller.
 *
 * Account-owned (`/customer/leads/:id/verify`), not the ref+token-gated
 * `/leads/verify`: the gate only ever mounts for a signed-in customer (see
 * app/_layout.tsx), and the token-gated route is unreachable for a lead this
 * DEVICE didn't create — GET /customer/leads never returns trackingToken (see
 * lib/leadTokens.ts's comment). A reinstall, a second phone, or a lead
 * attached later via claimDeviceLeads all had no token to send and hit a
 * permanent 404 on a screen with no way to dismiss it.
 */
export async function verifyLeadAmount(input: VerifyLeadInput): Promise<ApiLead> {
  return apiPost<ApiLead>(`/customer/leads/${input.leadId}/verify`, {
    decision: input.decision,
    clientAmount: input.clientAmount,
    note: input.note,
  });
}
