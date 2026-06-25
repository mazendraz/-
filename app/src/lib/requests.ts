import { useEffect, useState } from "react";
import { apiFetch, apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";

export type LeadStatus = "New" | "Contacted" | "In Progress" | "Completed" | "Cancelled";

export interface Lead {
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
  createdAt: number;
}

export const LEAD_STATUSES: LeadStatus[] = [
  "New",
  "Contacted",
  "In Progress",
  "Completed",
  "Cancelled",
];

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
// API into the local cache. No-op for unauthenticated customers, so it's safe to
// trigger from useLeads (the customer "My Requests" view just keeps its own).
export async function hydrateLeadsFromApi(): Promise<void> {
  if (!isApiConfigured() || !isAuthenticated()) return;
  const user = getCurrentUser();
  const endpoint =
    user?.role === "ADMIN"
      ? "/admin/leads?pageSize=100"
      : "/provider/leads?pageSize=100";
  try {
    const res = await apiGet<{ data: Lead[] }>(endpoint);
    localStorage.setItem(KEY, JSON.stringify(res.data));
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

async function trackLead(refNumber: string, phone: string): Promise<Lead | null> {
  try {
    return await apiGet<Lead>(
      `/leads/track?ref=${encodeURIComponent(refNumber)}&phone=${encodeURIComponent(phone)}`,
    );
  } catch {
    return null; // 404 (not found / phone mismatch) or network — keep local copy
  }
}

export async function refreshMyLeadsFromApi(): Promise<void> {
  // Admins/providers already get the authoritative list via hydrateLeadsFromApi.
  if (!isApiConfigured() || isAuthenticated()) return;
  const mineIds = new Set(readMine());
  const mine = read().filter((l) => mineIds.has(l.id));
  if (mine.length === 0) return;

  const results = await Promise.allSettled(
    mine.map((l) => trackLead(l.refNumber, l.phone)),
  );
  const byRef = new Map<string, Lead>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) byRef.set(r.value.refNumber, r.value);
  }
  if (byRef.size === 0) return;

  // Merge server truth over the local copy, keyed by the stable reference number.
  write(read().map((l) => byRef.get(l.refNumber) ?? l));
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
): Promise<void> {
  if (isApiConfigured()) {
    await apiPost("/reviews", { ref: refNumber, phone, rating, text, website: honeypot });
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
  data: Omit<Lead, "id" | "refNumber" | "status" | "createdAt">,
  // Honeypot value — real users leave this empty; bots fill it and the server
  // rejects the submission. Not part of the Lead shape, so it's passed sidecar.
  honeypot = "",
): Promise<Lead> {
  // When the API is configured, the backend is the source of truth. A failed
  // submission must surface as an error — we must NOT fake success and silently
  // drop the lead into this device's localStorage, or the customer is promised a
  // call that will never happen. Only the pure-localStorage (no API) mode below
  // is allowed to "succeed" offline, because that is the documented demo design.
  if (isApiConfigured()) {
    const created = await apiFetch<Lead>("/leads", {
      method: "POST",
      body: JSON.stringify({ ...data, website: honeypot }),
    });
    write([created, ...read()]);
    rememberMyRequest(created.id);
    return created;
  }
  const lead: Lead = {
    ...data,
    id: generateId(),
    refNumber: generateRef(),
    status: "New",
    createdAt: Date.now(),
  };
  write([lead, ...read()]);
  rememberMyRequest(lead.id);
  return lead;
}

export function updateLeadStatus(id: string, status: LeadStatus) {
  write(read().map((l) => (l.id === id ? { ...l, status } : l))); // optimistic
  if (isApiConfigured() && isAuthenticated()) {
    apiPatch(`/leads/${id}`, { status }).catch((err) => {
      console.error("Lead status update failed:", err);
      void hydrateLeadsFromApi(); // reconcile from the server
    });
  }
}

export function deleteLead(id: string) {
  write(read().filter((l) => l.id !== id)); // optimistic
  if (isApiConfigured() && isAuthenticated()) {
    apiDelete(`/admin/leads/${id}`).catch((err) => {
      console.error("Lead delete failed:", err);
      void hydrateLeadsFromApi();
    });
  }
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
