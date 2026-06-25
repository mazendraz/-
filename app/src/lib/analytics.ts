import type { Lead, LeadStatus } from "./requests";
import type { Company } from "./catalog";

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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Lead counts per day over the last `days` days (inclusive of today). */
export function leadsPerDay(leads: Lead[], days = 14): Point[] {
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
      label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      value: counts.get(k) ?? 0,
      key: k,
    });
  }
  return buckets;
}

/** Lead counts per calendar month over the last `months` months. */
export function leadsPerMonth(leads: Lead[], months = 6): Point[] {
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
      label: MONTHS[d.getMonth()],
      value: counts.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0,
    });
  }
  return buckets;
}

/** Lead distribution by status (for donut / bars). */
export function leadsByStatus(leads: Lead[]): Segment[] {
  const order: LeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];
  return order
    .map((status) => ({
      label: status,
      value: leads.filter((l) => l.status === status).length,
      color: STATUS_HEX[status],
    }))
    .filter((s) => s.value > 0);
}

/** Monotonic conversion funnel from received → completed. */
export function conversionFunnel(leads: Lead[]): Segment[] {
  const total = leads.length;
  const contacted = leads.filter((l) => ["Contacted", "In Progress", "Completed"].includes(l.status)).length;
  const inProgress = leads.filter((l) => ["In Progress", "Completed"].includes(l.status)).length;
  const completed = leads.filter((l) => l.status === "Completed").length;
  return [
    { label: "Received", value: total, color: "#005578" },
    { label: "Contacted", value: contacted, color: "#0b6e99" },
    { label: "In Progress", value: inProgress, color: "#ea580c" },
    { label: "Completed", value: completed, color: "#16a34a" },
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
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
