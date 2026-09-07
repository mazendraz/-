/**
 * Local copy of packages/core/src/lossReasons.ts's runtime rules.
 *
 * Why duplicated instead of imported: see the header comment in
 * ./emailTemplateRules.ts — same reason (api/'s Turbopack root is pinned to
 * api/ itself, so it cannot resolve a runtime import from @alassema/core,
 * which lives outside that root). This broke production on 2026-09-07
 * (commit e1eb6e8).
 *
 * If you change the rules in packages/core/src/lossReasons.ts, mirror the
 * change here too.
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
