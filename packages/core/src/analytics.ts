/**
 * The analytics BUSINESS DEFINITIONS, shared by every surface that reports
 * numbers to a human.
 *
 * ── Why these moved here ───────────────────────────────────────────────────
 * These formulas were written once, for the website's provider dashboard
 * (app/src/lib/analytics.ts). When the Business App gained its own analytics
 * screen, the choice was to re-derive them in the mobile app or to share them.
 * Re-deriving is how "conversion rate" quietly comes to mean two different
 * things on two screens a provider can hold side by side. So: one definition,
 * imported by both.
 *
 * ── What deliberately did NOT move ─────────────────────────────────────────
 * Labels and locale formatting. The website is bilingual and resolves labels
 * through its own `t(locale, key)`; the Business App is Arabic-only. Dragging
 * either app's i18n into this package would make it depend on a UI concern —
 * see README.md's rule about what may live here. So this module returns
 * NUMBERS and stable enum keys; each surface attaches its own words.
 *
 * Everything here is a pure function of `ApiLeadStats`, which the server has
 * already aggregated (api's stats.service.ts) and already scoped to whoever
 * asked — a provider's own company, or the platform for an admin.
 */
import type { ApiLeadStats, ApiLeadStatus } from "./apiTypes";

/**
 * Chart colours, as real hex values.
 *
 * SVG/canvas props can't take Tailwind classes and React Native has no
 * classes at all, so both surfaces need literals. Mirrors the website's
 * app/src/lib/chartColors.ts, whose own comment records that these are not new
 * colours — `primary`/`primaryContainer`/`secondary` come from
 * app/tailwind.config.js, and the other two are the stock Tailwind hues
 * already used for the KPI accent set.
 */
export const CHART_COLORS = {
  primary: "#005578",
  primaryContainer: "#0b6e99",
  blue: "#2563eb",
  green: "#16a34a",
  secondary: "#785a02",
} as const;

/** Per-status chart colour. Matches the website's STATUS_HEX exactly. */
export const STATUS_HEX: Record<ApiLeadStatus, string> = {
  New: "#2563eb",
  Contacted: "#ca8a04",
  "In Progress": "#ea580c",
  Completed: "#16a34a",
  Cancelled: "#9aa0a6",
};

/** Display order for status breakdowns — lifecycle order, not alphabetical. */
export const STATUS_ORDER: readonly ApiLeadStatus[] = [
  "New",
  "Contacted",
  "In Progress",
  "Completed",
  "Cancelled",
];

/**
 * Period-over-period change, as a rounded percentage.
 *
 * A zero baseline has no meaningful percentage, so it reports 100 for "some
 * from none" and 0 for "still none" rather than Infinity or NaN — the same
 * choice the website has always made.
 */
export function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/** The KPI delta for the trailing window the server was asked for. */
export function statsDelta(stats: ApiLeadStats): number {
  return deltaPercent(stats.recent.current, stats.recent.previous);
}

/**
 * Completion rate over the whole table, as a rounded percentage.
 *
 * `Completed / total` — deliberately measured against EVERY lead, including
 * cancelled ones, because that is the question a provider is actually asking
 * ("of everything that came in, how much did I finish?"). Changing the
 * denominator would change the meaning, so it is fixed here rather than left
 * to each caller.
 */
export function statsConversion(stats: ApiLeadStats): number {
  return stats.total
    ? Math.round(((stats.byStatus.Completed ?? 0) / stats.total) * 100)
    : 0;
}

/** One funnel stage: a count plus the status key it was derived from. */
export interface FunnelStage {
  /** Stable key for the caller to label and colour. */
  key: "received" | "contacted" | "inProgress" | "completed";
  value: number;
}

/**
 * Monotonic funnel from the status totals.
 *
 * Each stage is CUMULATIVE — a lead that reached "Completed" also passed
 * through "Contacted", so it is counted in both. Without that the funnel would
 * widen at the bottom whenever leads moved on, which reads as a bug rather
 * than as progress. `Cancelled` is deliberately absent: it is an exit from the
 * funnel, not a stage in it.
 */
export function statsFunnel(stats: ApiLeadStats): FunnelStage[] {
  const s = stats.byStatus;
  const completed = s.Completed ?? 0;
  const inProgress = (s["In Progress"] ?? 0) + completed;
  const contacted = (s.Contacted ?? 0) + inProgress;
  return [
    { key: "received", value: stats.total },
    { key: "contacted", value: contacted },
    { key: "inProgress", value: inProgress },
    { key: "completed", value: completed },
  ];
}

/** Status counts in lifecycle order, zero-value statuses dropped. */
export function statsByStatus(
  stats: ApiLeadStats,
): { status: ApiLeadStatus; value: number; color: string }[] {
  return STATUS_ORDER.map((status) => ({
    status,
    value: stats.byStatus[status] ?? 0,
    color: STATUS_HEX[status],
  })).filter((s) => s.value > 0);
}
