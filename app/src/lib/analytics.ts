import { LEAD_STATUS_KEYS, type Lead, type LeadStatus } from "./requests";
import type { Company } from "./catalog";
import type { ApiLeadStats } from "./apiTypes";
import { t, type Locale } from "./i18n";
import { intlLocale } from "./format";

// ── Status colors (hex — for charts) ────────────────────────────────────────
export const STATUS_HEX: Record<LeadStatus, string> = {
  New: "#2563eb",
  Contacted: "#ca8a04",
  "In Progress": "#ea580c",
  Completed: "#16a34a",
  Cancelled: "#9aa0a6",
};

export type Point = { label: string; value: number; key?: string };
export type Segment = { label: string; value: number; color: string };

// ── Date helpers ────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayKey(ts: number): string {
  const d = startOfDay(new Date(ts));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// Month names come from Intl, not a hard-coded English array: an Arabic screen
// showing "Jul" was the whole reason phase 7 touched dates at all.
function shortMonth(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "short" }).format(d);
}

/** Lead counts per day over the last `days` days (inclusive of today). */
export function leadsPerDay(leads: Lead[], days = 14, locale: Locale = "en"): Point[] {
  const today = startOfDay(new Date());
  const buckets: Point[] = [];
  const counts = new Map<string, number>();
  for (const l of leads) {
    const k = dayKey(l.createdAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    buckets.push({
      label: `${shortMonth(d, locale)} ${d.getDate()}`,
      value: counts.get(k) ?? 0,
      key: k,
    });
  }
  return buckets;
}

/** Lead counts per calendar month over the last `months` months. */
export function leadsPerMonth(leads: Lead[], months = 6, locale: Locale = "en"): Point[] {
  const now = new Date();
  const buckets: Point[] = [];
  const counts = new Map<string, number>();
  for (const l of leads) {
    const d = new Date(l.createdAt);
    counts.set(`${d.getFullYear()}-${d.getMonth()}`, (counts.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0) + 1);
  }
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      label: shortMonth(d, locale),
      value: counts.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0,
    });
  }
  return buckets;
}

/** Lead distribution by status (for donut / bars). */
export function leadsByStatus(leads: Lead[], locale: Locale = "en"): Segment[] {
  const order: LeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];
  return order
    .map((status) => ({
      label: t(locale, LEAD_STATUS_KEYS[status]),
      value: leads.filter((l) => l.status === status).length,
      color: STATUS_HEX[status],
    }))
    .filter((s) => s.value > 0);
}

/** Monotonic conversion funnel from received → completed. */
export function conversionFunnel(leads: Lead[], locale: Locale = "en"): Segment[] {
  const total = leads.length;
  const contacted = leads.filter((l) => ["Contacted", "In Progress", "Completed"].includes(l.status)).length;
  const inProgress = leads.filter((l) => ["In Progress", "Completed"].includes(l.status)).length;
  const completed = leads.filter((l) => l.status === "Completed").length;
  return [
    { label: t(locale, "chart_funnel_received"), value: total, color: "#005578" },
    { label: t(locale, "lead_status_contacted"), value: contacted, color: "#0b6e99" },
    { label: t(locale, "lead_status_in_progress"), value: inProgress, color: "#ea580c" },
    { label: t(locale, "lead_status_completed"), value: completed, color: "#16a34a" },
  ];
}

/** Top companies by lead volume. */
export function leadsByCompany(leads: Lead[], limit = 6): Point[] {
  const counts = new Map<string, number>();
  for (const l of leads) counts.set(l.companyName, (counts.get(l.companyName) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export type CompanyPerf = {
  company: Company;
  leads: number;
  completed: number;
  conversion: number; // %
};

/** Leaderboard of companies by performance. */
export function companyLeaderboard(companies: Company[], leads: Lead[]): CompanyPerf[] {
  return companies
    .map((company) => {
      const cLeads = leads.filter((l) => l.companySlug === company.slug);
      const completed = cLeads.filter((l) => l.status === "Completed").length;
      return {
        company,
        leads: cLeads.length,
        completed,
        conversion: cLeads.length ? Math.round((completed / cLeads.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.company.rating - a.company.rating);
}

/** Percentage change vs previous equal-length window (for KPI deltas). */
export function periodDelta(leads: Lead[], days = 7): number {
  const now = Date.now();
  const dayMs = 86_400_000;
  const current = leads.filter((l) => l.createdAt >= now - days * dayMs).length;
  const previous = leads.filter(
    (l) => l.createdAt >= now - 2 * days * dayMs && l.createdAt < now - days * dayMs
  ).length;
  return deltaPercent(current, previous);
}

function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Server-aggregate adapters ────────────────────────────────────────────────
//
// Everything above computes from a list of Lead rows, which only works when the
// browser holds the WHOLE dataset — true in demo mode, false the moment the API
// is live and the list is one capped page. In API mode the dashboards read
// ApiLeadStats instead, and these turn it into the same Point[]/Segment[] the
// chart components already take, so nothing downstream changes.
//
// Labelling and colour stay here on purpose: the server sends dates and counts,
// not display strings, so the same payload renders correctly in both languages.

/** "2026-07-28" → "Jul 28", localized. Bucket keys are Cairo-local calendar
 *  dates, so they are parsed as plain Y/M/D and never shifted by a timezone. */
function labelDay(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return `${shortMonth(at, locale)} ${at.getDate()}`;
}

/** "2026-07" → "Jul", localized. */
function labelMonth(iso: string, locale: Locale): string {
  const [y, m] = iso.split("-").map(Number);
  return shortMonth(new Date(y!, (m ?? 1) - 1, 1), locale);
}

export function statsPerDay(stats: ApiLeadStats, locale: Locale): Point[] {
  return stats.perDay.map((b) => ({
    label: labelDay(b.date, locale),
    value: b.count,
    key: b.date,
  }));
}

export function statsPerMonth(stats: ApiLeadStats, locale: Locale): Point[] {
  return stats.perMonth.map((b) => ({ label: labelMonth(b.date, locale), value: b.count }));
}

export function statsByStatus(stats: ApiLeadStats, locale: Locale): Segment[] {
  const order: LeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];
  return order
    .map((status) => ({
      label: t(locale, LEAD_STATUS_KEYS[status]),
      value: stats.byStatus[status] ?? 0,
      color: STATUS_HEX[status],
    }))
    .filter((s) => s.value > 0);
}

/**
 * Monotonic funnel from the status totals.
 *
 * Each stage counts everything that reached it OR moved past it, which is why
 * "contacted" includes in-progress and completed rows — a funnel whose later
 * stage exceeded its earlier one would read as nonsense.
 */
export function statsFunnel(stats: ApiLeadStats, locale: Locale): Segment[] {
  const s = stats.byStatus;
  const completed = s.Completed ?? 0;
  const inProgress = (s["In Progress"] ?? 0) + completed;
  const contacted = (s.Contacted ?? 0) + inProgress;
  return [
    { label: t(locale, "chart_funnel_received"), value: stats.total, color: "#005578" },
    { label: t(locale, "lead_status_contacted"), value: contacted, color: "#0b6e99" },
    { label: t(locale, "lead_status_in_progress"), value: inProgress, color: "#ea580c" },
    { label: t(locale, "lead_status_completed"), value: completed, color: "#16a34a" },
  ];
}

/** Top companies by volume (admin only — empty on the provider endpoint). */
export function statsByCompany(stats: ApiLeadStats, limit = 6): Point[] {
  return stats.byCompany.slice(0, limit).map((c) => ({ label: c.companyName, value: c.leads }));
}

export function statsDelta(stats: ApiLeadStats): number {
  return deltaPercent(stats.recent.current, stats.recent.previous);
}

/** Completion rate over the WHOLE table — the number the capped client-side
 *  version got wrong, because its denominator was one page. */
export function statsConversion(stats: ApiLeadStats): number {
  return stats.total ? Math.round(((stats.byStatus.Completed ?? 0) / stats.total) * 100) : 0;
}
