// Provider/admin availability ("busy") controls + the public waiting list.
// In API mode these hit the backend; in demo mode (no VITE_API_URL) writes are a
// best-effort no-op so the UI still works against the localStorage catalog.
import { apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import { refreshCatalogFromApi } from "./catalog";
import type {
  ApiWaitlistEntry,
  ApiWaitlistStatus,
  ApiAvailabilityPayload,
} from "./apiTypes";

export type WaitlistStatus = ApiWaitlistStatus;
export type WaitlistEntry = ApiWaitlistEntry;

export const WAITLIST_STATUSES: WaitlistStatus[] = [
  "WAITING",
  "NOTIFIED",
  "CONVERTED",
  "CANCELLED",
];

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  WAITING: "Waiting",
  NOTIFIED: "Notified",
  CONVERTED: "Converted",
  CANCELLED: "Cancelled",
};

// Pill colours for each waitlist status (Tailwind classes, matches STATUS_COLORS style).
export const WAITLIST_STATUS_COLORS: Record<WaitlistStatus, string> = {
  WAITING: "bg-amber-100 text-amber-800",
  NOTIFIED: "bg-blue-100 text-blue-700",
  CONVERTED: "bg-green-100 text-green-800",
  CANCELLED: "bg-surface-container text-outline",
};

export interface AvailabilityPayload {
  busy: boolean;
  busyUntil?: number | null; // epoch ms, or null to clear the auto-reopen date
  busyNote?: string | null;
}

function body(p: AvailabilityPayload): ApiAvailabilityPayload {
  return { busy: p.busy, busyUntil: p.busyUntil ?? null, busyNote: p.busyNote ?? null };
}

/** Provider: set MY company's availability. Re-syncs the catalog on completion. */
export async function setMyAvailability(p: AvailabilityPayload): Promise<void> {
  if (!isApiConfigured()) return;
  try {
    await apiPatch("/provider/availability", body(p));
  } finally {
    void refreshCatalogFromApi();
  }
}

/** Admin: set a specific company's availability. Re-syncs the catalog on completion. */
export async function setCompanyAvailability(id: string, p: AvailabilityPayload): Promise<void> {
  if (!isApiConfigured()) return;
  try {
    await apiPatch(`/admin/companies/${id}/availability`, body(p));
  } finally {
    void refreshCatalogFromApi();
  }
}

// ── Public: join the waiting list ────────────────────────────────────────────
export interface WaitlistJoinInput {
  name: string;
  phone: string;
  service?: string;
  note?: string;
}

/**
 * Public: join a company's waiting list. In API mode the backend is authoritative
 * (a failed submission surfaces — don't fake success). In demo mode it resolves so
 * the modal shows its success state.
 */
export async function joinWaitlist(
  companySlug: string,
  input: WaitlistJoinInput,
  honeypot = "",
  captchaToken?: string | null,
): Promise<void> {
  if (!isApiConfigured()) return;
  await apiPost<ApiWaitlistEntry>(`/companies/${companySlug}/waitlist`, {
    name: input.name,
    phone: input.phone,
    service: input.service || undefined,
    note: input.note || undefined,
    hp_field: honeypot,
    captchaToken: captchaToken ?? undefined,
  });
}

// ── Provider/admin: manage the waiting list ───────────────────────────────────
// Scope decides which endpoints are used: a provider manages their own company's
// list; an admin manages a specific company's list by id.
export type WaitlistScope =
  | { kind: "provider" }
  | { kind: "admin"; companyId: string };

function basePath(scope: WaitlistScope): string {
  return scope.kind === "provider"
    ? "/provider/waitlist"
    : `/admin/companies/${scope.companyId}/waitlist`;
}

type ApiPage<T> = { data: T[]; meta: { total: number; page: number; pageSize: number } };

/** List a company's waiting list (newest first). Returns [] in demo mode. */
export async function listWaitlist(scope: WaitlistScope, status?: WaitlistStatus): Promise<WaitlistEntry[]> {
  if (!isApiConfigured()) return [];
  const q = status ? `?status=${status}&pageSize=100` : "?pageSize=100";
  const res = await apiGet<ApiPage<WaitlistEntry>>(`${basePath(scope)}${q}`);
  return res.data;
}

export async function setWaitlistStatus(scope: WaitlistScope, id: string, status: WaitlistStatus): Promise<void> {
  if (!isApiConfigured()) return;
  await apiPatch(`${basePath(scope)}/${id}`, { status });
}

export async function deleteWaitlistEntry(scope: WaitlistScope, id: string): Promise<void> {
  if (!isApiConfigured()) return;
  await apiDelete(`${basePath(scope)}/${id}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Effective busy state for a company card/profile. The server already resolves
 *  `busy` against busyUntil; in demo mode we re-check the date locally as a fallback. */
export function isBusy(c: { busy?: boolean | null; busyUntil?: number | null }): boolean {
  if (!c.busy) return false;
  if (c.busyUntil != null && c.busyUntil <= Date.now()) return false;
  return true;
}

/** Format an epoch-ms reopen date for display (locale-aware, date only). */
export function formatReopenDate(epochMs: number, locale?: string): string {
  return new Date(epochMs).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
