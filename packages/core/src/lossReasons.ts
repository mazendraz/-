/**
 * Why a request was cancelled.
 *
 * The gap this closes: `LeadStatus` had exactly one way to end badly —
 * CANCELLED — and nothing recorded what "badly" meant. So a month of cancelled
 * requests was a count and nothing else, and every explanation for it ("people
 * think we're expensive", "nobody was answering", "they went with someone
 * else") was a guess with no column behind it. A fixed, small set of reasons
 * turns that count into the one number that actually changes what to do next.
 *
 * Deliberately short. A long list gets answered with whichever option is first
 * or last, and a free-text-only field gets answered with "" — so: a required
 * choice from these, plus an optional note for the detail that doesn't fit.
 *
 * Runtime values, so this is its own file rather than apiTypes.ts (which is
 * re-exported as `export type *` and would erase a const array). Same reasoning
 * as districts.ts and emailTemplates.ts.
 */
export const LEAD_LOSS_REASONS = [
  "PRICE",
  "NO_RESPONSE",
  "CHOSE_COMPETITOR",
  "TIMING",
  "OUT_OF_SCOPE",
  "DUPLICATE",
  "CUSTOMER_CHANGED_MIND",
  "OTHER",
] as const;

export type ApiLeadLossReason = (typeof LEAD_LOSS_REASONS)[number];

/**
 * Arabic labels — the only language these are ever shown in. Both dashboards
 * and the Business App are Arabic for provider/admin work, and an English
 * enum name shown to whoever is closing out a request is how you get everyone
 * defaulting to OTHER.
 */
export const LEAD_LOSS_REASON_LABELS_AR: Record<ApiLeadLossReason, string> = {
  PRICE: "السعر",
  NO_RESPONSE: "العميل مردّش",
  CHOSE_COMPETITOR: "راح لحد تاني",
  TIMING: "الوقت/التوقيت",
  OUT_OF_SCOPE: "خدمة مش بنعملها",
  DUPLICATE: "طلب مكرر",
  CUSTOMER_CHANGED_MIND: "العميل غيّر رأيه",
  OTHER: "سبب تاني",
};

export const LEAD_LOSS_REASON_LABELS_EN: Record<ApiLeadLossReason, string> = {
  PRICE: "Price",
  NO_RESPONSE: "Customer didn't respond",
  CHOSE_COMPETITOR: "Went with someone else",
  TIMING: "Timing",
  OUT_OF_SCOPE: "Service we don't offer",
  DUPLICATE: "Duplicate request",
  CUSTOMER_CHANGED_MIND: "Customer changed their mind",
  OTHER: "Other",
};

/**
 * OTHER without a note is the answer that records nothing — it is the "" this
 * whole field exists to stop being the only thing in the column. So it is the
 * one reason that carries its note as a requirement rather than an option.
 */
export const LOSS_NOTE_REQUIRED_FOR: readonly ApiLeadLossReason[] = ["OTHER"];

export function isLeadLossReason(v: unknown): v is ApiLeadLossReason {
  return typeof v === "string" && (LEAD_LOSS_REASONS as readonly string[]).includes(v);
}

/**
 * Why this cancellation can't be recorded, or null if it can. Shared so the
 * dashboards, the Business App and the API all refuse the same input — the API
 * being the one that actually decides.
 */
export function checkLossReason(
  reason: string | null | undefined,
  note: string | null | undefined,
): string | null {
  if (!reason) return "Pick why this request was cancelled.";
  if (!isLeadLossReason(reason)) return "Unknown cancellation reason.";
  if (LOSS_NOTE_REQUIRED_FOR.includes(reason) && !(note ?? "").trim()) {
    return "Say briefly what happened — 'Other' with no note records nothing.";
  }
  return null;
}
