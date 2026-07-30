// Provider/admin availability ("busy") controls + the public waiting list.
// In API mode these hit the backend; in demo mode (no VITE_API_URL) writes are a
// best-effort no-op so the UI still works against the localStorage catalog.
import { apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import { refreshCatalogFromApi } from "./catalog";
import { formatDate } from "./format";
import type { Locale, StringKey } from "./i18n";
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

/**
 * Translation keys for each waitlist status. Keys rather than literals so the
 * label follows the site language — resolve with t(locale, WAITLIST_STATUS_KEYS[s])
 * at the point of render.
 */
export const WAITLIST_STATUS_KEYS: Record<WaitlistStatus, StringKey> = {
  WAITING: "prov_wl_status_waiting",
  NOTIFIED: "prov_wl_status_notified",
  CONVERTED: "prov_wl_status_converted",
  CANCELLED: "prov_wl_status_cancelled",
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

/**
 * Effective busy state for a company card/profile.
 *
 * In API mode `busy` is taken AS GIVEN, because the server already resolved it:
 * serialize.isEffectivelyBusy ORs the manual switch together with every running
 * scheduled window. `busyUntil`, by contrast, is only the MANUAL switch's expiry.
 *
 * Re-checking `busyUntil` here used to override the server and get it wrong: a
 * company with a lapsed manual busyUntil AND a scheduled window running right now
 * is sent as busy: true, busyUntil: <past> — and the old date check flipped that
 * back to available. The profile then offered "Request service" for a period the
 * provider had deliberately blocked out, which is exactly the outcome the note on
 * isEffectivelyBusy says must be impossible.
 *
 * Demo mode has no server to resolve anything, so there the local date check is
 * the only thing available and is still applied.
 */
export function isBusy(c: { busy?: boolean | null; busyUntil?: number | null }): boolean {
  if (!c.busy) return false;
  if (isApiConfigured()) return true;
  return c.busyUntil == null || c.busyUntil > Date.now();
}

/**
 * When the company is next available, for display.
 *
 * `nextAvailableAt` first: it is the server's resolved end across the manual
 * switch AND every running scheduled window, whereas `busyUntil` is only the
 * manual switch's own expiry. Reading busyUntil alone made a company that is
 * busy because of a SCHEDULED period show no return date at all — the copy fell
 * through to the date-less "fully booked" wording while the server knew exactly
 * when they reopen.
 *
 * null = genuinely open-ended (busy with no end set), so callers should show the
 * date-less wording. Do NOT use this to seed the availability editor: that edits
 * the manual switch and must show `busyUntil` itself.
 */
export function availableAgainAt(c: {
  nextAvailableAt?: number | null;
  busyUntil?: number | null;
}): number | null {
  return c.nextAvailableAt ?? c.busyUntil ?? null;
}

/**
 * Format an epoch-ms reopen date for display.
 *
 * ⚠ `locale` is optional ONLY because three callers that predate the i18n pass
 * still omit it — `AvailabilityControl`, `ProviderDashboard` and
 * `pages/admin/index`. Omitting it falls back to the BROWSER's locale, so those
 * three show an English date inside the Arabic site.
 *
 * Those files are the provider/admin dashboards, migrated in phase 7B/7C. The
 * guard test flags every single-argument call and lists exactly those three as
 * temporary exemptions — when 7B/7C removes them, make this parameter required
 * and delete this note.
 */
export function formatReopenDate(epochMs: number, locale?: Locale): string {
  return locale
    ? formatDate(epochMs, locale)
    : new Date(epochMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Scheduled busy windows (Feature F) ───────────────────────────────────────
// Periods a company blocks out in advance. The server derives `busy` from these
// PLUS the manual switch on every read, so a period opens and closes on its own
// with nothing scheduled — the client only schedules and displays.

export interface BusyWindow {
  id: string;
  companyId: string;
  startsAt: number;
  /** null = open-ended, until someone closes it. */
  endsAt: number | null;
  note: string | null;
  /** Set by an admin — the provider can see it but not edit or remove it. */
  createdByAdmin: boolean;
  createdAt: number;
}

export interface BusyWindowInput {
  startsAt: number;
  endsAt?: number | null;
  note?: string | null;
}

/** Provider: their own company's running + upcoming periods. */
export function listMyBusyWindows(): Promise<BusyWindow[]> {
  return apiGet<BusyWindow[]>("/provider/busy-windows");
}

export function createMyBusyWindow(input: BusyWindowInput): Promise<BusyWindow> {
  return apiPost<BusyWindow>("/provider/busy-windows", input);
}

export function updateMyBusyWindow(id: string, input: BusyWindowInput): Promise<BusyWindow> {
  return apiPatch<BusyWindow>(`/provider/busy-windows/${id}`, input);
}

export function deleteMyBusyWindow(id: string): Promise<void> {
  return apiDelete(`/provider/busy-windows/${id}`);
}

/** Admin: manage periods on any company. */
export function listCompanyBusyWindows(companyId: string): Promise<BusyWindow[]> {
  return apiGet<BusyWindow[]>(`/admin/companies/${companyId}/busy-windows`);
}

export function createCompanyBusyWindow(companyId: string, input: BusyWindowInput): Promise<BusyWindow> {
  return apiPost<BusyWindow>(`/admin/companies/${companyId}/busy-windows`, input);
}

export function deleteCompanyBusyWindow(companyId: string, windowId: string): Promise<void> {
  return apiDelete(`/admin/companies/${companyId}/busy-windows/${windowId}`);
}

/**
 * A short availability line for a card or profile badge.
 *
 * Reads the server-derived fields rather than recomputing: the backend already
 * resolved the manual switch and every scheduled window together, and a second
 * implementation here could disagree with the page the customer is looking at.
 */
export function availabilityLabel(
  c: {
    busy?: boolean | null;
    busyUntil?: number | null;
    nextAvailableAt?: number | null;
    upcomingBusyFrom?: number | null;
    busyReason?: string | null;
    responseTime?: string;
  },
  locale: "en" | "ar",
): { state: "busy" | "upcoming" | "free"; text: string } {
  const ar = locale === "ar";

  if (isBusy(c)) {
    const back = c.nextAvailableAt ?? c.busyUntil ?? null;
    return {
      state: "busy",
      text: back
        ? ar
          ? `مشغول · يرجع ${formatReopenDate(back, locale)}`
          : `Busy · back ${formatReopenDate(back, locale)}`
        : ar ? "مشغول" : "Busy",
    };
  }

  // Available, but with something on the calendar — worth flagging without
  // blocking the request.
  if (c.upcomingBusyFrom != null) {
    return {
      state: "upcoming",
      text: ar
        ? `مشغول من ${formatReopenDate(c.upcomingBusyFrom, locale)}`
        : `Busy from ${formatReopenDate(c.upcomingBusyFrom, locale)}`,
    };
  }

  return {
    state: "free",
    text: c.responseTime
      ? ar ? `متاح · بيرد ${c.responseTime}` : `Available · replies ${c.responseTime}`
      : ar ? "متاح" : "Available",
  };
}

/** Range label for a scheduled period. */
export function formatWindowRange(w: BusyWindow, locale: "en" | "ar"): string {
  const from = formatReopenDate(w.startsAt, locale);
  if (w.endsAt == null) return locale === "ar" ? `من ${from} — مفتوح` : `From ${from} — open-ended`;
  return `${from} → ${formatReopenDate(w.endsAt, locale)}`;
}
