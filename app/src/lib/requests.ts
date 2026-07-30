import { useEffect, useState } from "react";
import { apiFetch, apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";
import type { StringKey } from "./i18n";

export type LeadStatus = "New" | "Contacted" | "In Progress" | "Completed" | "Cancelled";

export interface Lead {
  // Feature C — snapshots taken at submission; never recomputed on read.
  items?: import("./apiTypes").ApiLeadItem[];
  estimatedMin?: number | null;
  estimatedMax?: number | null;
  discountPercent?: number;
  hasOnInspection?: boolean;
  id: string;
  refNumber: string;   // e.g. AA-20240610-X4K2
  companySlug: string;
  companyName: string;
  service: string;
  // Customer fields
  name: string;
  phone: string;
  district: string;
  budget: string;
  description: string;
  status: LeadStatus;
  reviewed?: boolean; // true once the customer has left a review for this lead
  // High-entropy secret returned on creation; stored on this device and sent to
  // gate status tracking + the review (replaces sending the phone as the secret).
  trackingToken?: string;
  createdAt: number;
}

export const LEAD_STATUSES: LeadStatus[] = [
  "New",
  "Contacted",
  "In Progress",
  "Completed",
  "Cancelled",
];

/**
 * Display keys for each lead status. The LeadStatus values themselves are the API
 * contract ("New", "Contacted", …) and must not change — this maps them to
 * translatable labels. Resolve with t(locale, LEAD_STATUS_KEYS[status]).
 */
export const LEAD_STATUS_KEYS: Record<LeadStatus, StringKey> = {
  New: "lead_status_new",
  Contacted: "lead_status_contacted",
  "In Progress": "lead_status_in_progress",
  Completed: "lead_status_completed",
  Cancelled: "lead_status_cancelled",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  New: "bg-blue-100 text-blue-700",
  Contacted: "bg-yellow-100 text-yellow-700",
  "In Progress": "bg-orange-100 text-orange-700",
  Completed: "bg-green-100 text-green-700",
  Cancelled: "bg-surface-container text-outline",
};

export const DISTRICTS = [
  "R7 District",
  "R8 District",
  "R9 District",
  "Central Business District",
  "Diplomatic Quarter",
  "Government District",
  "Green River Area",
  "Other",
];

export const BUDGETS = [
  "Under EGP 50,000",
  "EGP 50,000 – 150,000",
  "EGP 150,000 – 500,000",
  "EGP 500,000 – 1,000,000",
  "Over EGP 1,000,000",
  "Prefer not to say",
];

const KEY = "al-assema-leads";
const EVENT = "al-assema-leads-changed";

function generateRef(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AA-${date}-${rand}`;
}

function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

function read(): Lead[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Lead[]) : [];
  } catch {
    return [];
  }
}

function write(list: Lead[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

// ── API hydration ───────────────────────────────────────────────────────────
// When signed in (admin or provider), pull the authoritative lead list from the
// API into the local cache.
//
// The comment this replaced assumed this only ever runs on the admin/provider
// dashboards, "so the customer 'My Requests' view just keeps its own" — but both
// read AND write the same localStorage KEY, and there is nothing stopping the
// same browser from also being the customer's own device (a provider testing
// their own site, an admin who also submitted a request, or simply a dev machine
// used for both). Admin/provider list payloads never carry trackingToken (see
// serializeLead — it is issued once, on creation, never resent on a read), so a
// blind overwrite wiped it from every lead THIS device had ever submitted,
// including ones with no relation to the admin/provider account at all. The
// customer's own chat and review access then failed with "Conversation not
// found" — a 404 that looked like a chat bug but was actually this cache getting
// silently clobbered by an unrelated dashboard load in the background.
export async function hydrateLeadsFromApi(): Promise<void> {
  if (!isApiConfigured() || !isAuthenticated()) return;
  const user = getCurrentUser();
  const endpoint =
    user?.role === "ADMIN"
      ? "/admin/leads?pageSize=100"
      : "/provider/leads?pageSize=100";
  try {
    const res = await apiGet<{ data: Lead[] }>(endpoint);
    // Preserve any trackingToken this device already holds for a lead it also
    // owns as a customer — the server's admin/provider view has no such field to
    // give back, so merging (not replacing) is the only way to keep both true.
    const previousById = new Map(read().map((l) => [l.id, l]));
    const merged = res.data.map((l) => {
      const mine = previousById.get(l.id)?.trackingToken;
      return mine ? { ...l, trackingToken: mine } : l;
    });
    localStorage.setItem(KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch (err) {
    console.error("Leads hydration from API failed:", err);
  }
}

// ── Customer status tracking ─────────────────────────────────────────────────
// Unauthenticated customers have no account, but they CAN re-fetch the live
// status of their own submissions via the public track endpoint, gated by the
// reference number + the phone they used (a shared secret). This keeps the "My
// Requests" view in sync with the provider/admin pipeline instead of frozen at
// "New" forever. Runs once per session (statuses change on a human timescale).
let myLeadsHydrated = false;

async function trackLead(
  refNumber: string,
  token: string | undefined,
  phone: string,
): Promise<Lead | null> {
  try {
    // Prefer the high-entropy token; fall back to phone for legacy leads that
    // predate it (and were stored without one).
    const secret = token
      ? `token=${encodeURIComponent(token)}`
      : `phone=${encodeURIComponent(phone)}`;
    return await apiGet<Lead>(`/leads/track?ref=${encodeURIComponent(refNumber)}&${secret}`);
  } catch {
    return null; // 404 (not found / secret mismatch) or network — keep local copy
  }
}

export async function refreshMyLeadsFromApi(): Promise<void> {
  // Admins/providers already get the authoritative list via hydrateLeadsFromApi.
  if (!isApiConfigured() || isAuthenticated()) return;
  const mineIds = new Set(readMine());
  const mine = read().filter((l) => mineIds.has(l.id));
  if (mine.length === 0) return;

  const results = await Promise.allSettled(
    mine.map((l) => trackLead(l.refNumber, l.trackingToken, l.phone)),
  );
  const byRef = new Map<string, Lead>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) byRef.set(r.value.refNumber, r.value);
  }
  if (byRef.size === 0) return;

  // Merge server truth over the local copy, keyed by the stable reference number.
  //
  // trackingToken is carried over explicitly: the API returns it ONLY in the
  // creation response, never in a read, so this device's copy is the only place
  // it exists. Spreading the server row over the local one would drop it, and
  // with it the customer's ability to open their own chat — a silent 404 that
  // only appears after the list happens to refresh.
  write(read().map((l) => {
    const fresh = byRef.get(l.refNumber);
    return fresh ? { ...fresh, trackingToken: fresh.trackingToken ?? l.trackingToken } : l;
  }));
}

/**
 * Customer submits a review for a COMPLETED request of theirs. Gated server-side
 * by ref + phone; on success the lead is marked reviewed locally so the prompt
 * disappears. In demo mode (no API) it just marks locally.
 */
export async function submitReview(
  refNumber: string,
  phone: string,
  rating: number,
  text: string,
  honeypot = "",
  captchaToken?: string | null,
  // The lead's tracking token (preferred secret); phone is the legacy fallback.
  trackingToken?: string,
): Promise<void> {
  if (isApiConfigured()) {
    await apiPost("/reviews", {
      ref: refNumber,
      // Send the token when we have it; otherwise fall back to phone (legacy leads).
      ...(trackingToken ? { token: trackingToken } : { phone }),
      rating,
      text,
      hp_field: honeypot,
      captchaToken: captchaToken ?? undefined,
    });
  }
  write(read().map((l) => (l.refNumber === refNumber ? { ...l, reviewed: true } : l)));
}

export function getLeads(): Lead[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function getLeadsForCompany(companySlug: string): Lead[] {
  return getLeads().filter((l) => l.companySlug === companySlug);
}

export async function addLead(
  // Feature C: `items` carries the chosen lines WITHOUT prices — the server reads
  // those from the catalogue, so a basket can never be submitted with a total the
  // browser made up. Omit it for the classic single-service request.
  // `items` is omitted from the Lead base and re-declared: on a Lead it is the
  // server's priced snapshot, but on the way IN it is just a selection.
  data: Omit<Lead, "id" | "refNumber" | "status" | "createdAt" | "items"> & {
    items?: { offeringId: string; qty?: number; tierId?: string | null }[];
  },
  // Honeypot value — real users leave this empty; bots fill it and the server
  // rejects the submission. Not part of the Lead shape, so it's passed sidecar.
  honeypot = "",
  // CAPTCHA token (Turnstile). Only present when VITE_TURNSTILE_SITE_KEY is set;
  // the backend ignores it unless TURNSTILE_SECRET_KEY is configured.
  captchaToken?: string | null,
): Promise<Lead> {
  // When the API is configured, the backend is the source of truth. A failed
  // submission must surface as an error — we must NOT fake success and silently
  // drop the lead into this device's localStorage, or the customer is promised a
  // call that will never happen. Only the pure-localStorage (no API) mode below
  // is allowed to "succeed" offline, because that is the documented demo design.
  if (isApiConfigured()) {
    const created = await apiFetch<Lead>("/leads", {
      method: "POST",
      body: JSON.stringify({ ...data, hp_field: honeypot, captchaToken: captchaToken ?? undefined }),
    });
    write([created, ...read()]);
    rememberMyRequest(created.id);
    return created;
  }
  // Demo mode: no server, so nothing prices the selection. The selection itself
  // is dropped rather than stored — a Lead.items entry means "priced snapshot",
  // and writing unpriced stand-ins there would make the record lie.
  const { items: _selection, ...rest } = data;
  const lead: Lead = {
    ...rest,
    id: generateId(),
    refNumber: generateRef(),
    status: "New",
    createdAt: Date.now(),
  };
  write([lead, ...read()]);
  rememberMyRequest(lead.id);
  return lead;
}

// Returns a promise that resolves once the server PATCH settles, so callers driving
// a server-paginated list can refresh() afterward without racing the write.
export function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  write(read().map((l) => (l.id === id ? { ...l, status } : l))); // optimistic
  if (isApiConfigured() && isAuthenticated()) {
    return apiPatch(`/leads/${id}`, { status })
      .then(() => undefined)
      .catch((err) => {
        console.error("Lead status update failed:", err);
        void hydrateLeadsFromApi(); // reconcile from the server
      });
  }
  return Promise.resolve();
}

export function deleteLead(id: string): Promise<void> {
  write(read().filter((l) => l.id !== id)); // optimistic
  if (isApiConfigured() && isAuthenticated()) {
    return apiDelete(`/admin/leads/${id}`)
      .then(() => undefined)
      .catch((err) => {
        console.error("Lead delete failed:", err);
        void hydrateLeadsFromApi();
      });
  }
  return Promise.resolve();
}

/** Bulk-insert leads (used by the demo-data loader). */
export function addRawLeads(leads: Lead[]) {
  write([...leads, ...read()]);
}

/** Remove every lead (admin maintenance). */
export function clearAllLeads() {
  write([]);
}

export function useLeads(): Lead[] {
  const [list, setList] = useState<Lead[]>(() => getLeads());
  useEffect(() => {
    const refresh = () => setList(getLeads());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    void hydrateLeadsFromApi(); // no-op unless signed in + API configured
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

export function useLeadsForCompany(slug: string): Lead[] {
  const all = useLeads();
  return all.filter((l) => l.companySlug === slug);
}

// ── "My Requests" — this device's own submissions (no account needed) ───────
const MINE_KEY = "al-assema-my-requests";

function readMine(): string[] {
  try {
    const raw = localStorage.getItem(MINE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberMyRequest(id: string) {
  const ids = readMine();
  if (!ids.includes(id)) {
    localStorage.setItem(MINE_KEY, JSON.stringify([id, ...ids]));
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

/** Leads submitted from this device, newest first. */
export function getMyLeads(): Lead[] {
  const mineIds = new Set(readMine());
  return getLeads().filter((l) => mineIds.has(l.id));
}

/**
 * This device's leads reduced to what the chat endpoints need to prove ownership.
 *
 * A customer has no account: the reference number plus its tracking token IS the
 * credential. Kept here rather than in the chat module because this file owns
 * what "my requests" means, and the messages list must be exactly that set.
 */
export function useMyLeadClaims(): { ref: string; token?: string; phone: string }[] {
  const mine = useMyLeads();
  return mine.map((l) => ({ ref: l.refNumber, token: l.trackingToken, phone: l.phone }));
}

export function useMyLeads(): Lead[] {
  const all = useLeads();
  const [mineIds, setMineIds] = useState<Set<string>>(() => new Set(readMine()));
  useEffect(() => {
    const refresh = () => setMineIds(new Set(readMine()));
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Pull live status for this device's submissions (once per session).
    if (!myLeadsHydrated) {
      myLeadsHydrated = true;
      void refreshMyLeadsFromApi();
    }
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return all.filter((l) => mineIds.has(l.id));
}
