import { useEffect, useState } from "react";
import { ApiError, apiFetch, apiGet, apiPost, apiPatch, apiDelete, isApiConfigured, reportHydrationFailure } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";
import type { StringKey } from "./i18n";
import { DISTRICTS as CORE_DISTRICTS } from "@alassema/core";

export type LeadStatus = "New" | "Contacted" | "In Progress" | "Completed" | "Cancelled";

export type VerificationStatus = "PENDING" | "CONFIRMED" | "DISCREPANCY";

/** Provider's "mark as completed" record — present on Lead.completion once the
 *  provider has submitted it (absent until then). */
export interface LeadCompletion {
  providerAmount: number;
  additionalWorkDescription: string | null;
  additionalWorkAmount: number | null;
  notes: string | null;
  attachments: string[];
  finalTotal: number;
  submittedAt: number;
  verificationStatus: VerificationStatus;
  clientAmount: number | null;
  discrepancyNote: string | null;
  verifiedAt: number | null;
}

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
  // CLIENT-SIDE ONLY, never sent by the API: set by absorbAccountLeads on rows
  // that arrived from GET /customer/leads. It marks the rows whose live status
  // comes from the ACCOUNT pull, so refreshMyLeadsFromApi knows not to also
  // chase them through the anonymous tracking gate — which cannot work for them
  // (no trackingToken is ever returned there) and would spend the whole per-IP
  // budget on guaranteed 404s.
  accountOwned?: boolean;
  createdAt: number;
  // Absent until the provider marks the service completed. See LeadCompletion.
  completion?: LeadCompletion;
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

// Moved to @alassema/core so mobile/client doesn't need a third copy —
// re-exported here (as a mutable array, matching every existing caller's
// expectation) so this file's own callers see no change.
export const DISTRICTS: string[] = [...CORE_DISTRICTS];

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
// Shared across every concurrent caller — see the dedupe note in the function.
let hydrationInFlight: Promise<void> | null = null;

export async function hydrateLeadsFromApi(): Promise<void> {
  if (!isApiConfigured() || !isAuthenticated()) return;
  // Every component that calls useLeads() fires this on mount, and a dashboard
  // page mounts several at once (AdminLayout + the tab body, at minimum) — so
  // one page load issued N identical pageSize=100 requests, doubled again by
  // StrictMode in dev. Measured on /admin: 4 per navigation. Callers now share
  // the first one's promise, the same way useMyLeads already guards its own
  // hydration with a module-level flag.
  if (hydrationInFlight) return hydrationInFlight;
  hydrationInFlight = doHydrateLeads().finally(() => { hydrationInFlight = null; });
  return hydrationInFlight;
}

async function doHydrateLeads(): Promise<void> {
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
    reportHydrationFailure("Leads hydration from API", err);
  }
}

// ── Customer status tracking ─────────────────────────────────────────────────
// Unauthenticated customers have no account, but they CAN re-fetch the live
// status of their own submissions via the public track endpoint, gated by the
// reference number + the phone they used (a shared secret). This keeps the "My
// Requests" view in sync with the provider/admin pipeline instead of frozen at
// "New" forever. Runs once per session (statuses change on a human timescale).
let myLeadsHydrated = false;

// Lets RootLayout's mandatory price-verification gate (see useMyLeadsHydrated
// below) hold the FIRST paint until the server has actually been asked whether
// this device has a pending verification — otherwise a refresh briefly renders
// from the stale pre-verification localStorage snapshot before the async
// refreshMyLeadsFromApi() call resolves, which is a real (if narrow) way to
// glimpse/navigate the site before the block reasserts itself. The whole point
// of "the block must persist after refresh" is that the server, not whatever
// this device cached last time, decides.
let myLeadsHydrationSettled = false;
const myLeadsHydrationListeners = new Set<() => void>();

function markMyLeadsHydrationSettled() {
  myLeadsHydrationSettled = true;
  myLeadsHydrationListeners.forEach((fn) => fn());
}

/**
 * One lead's live status, or null when the server says it can't have it.
 *
 * Rejects — rather than returning null — when the request never reached the
 * server at all (ApiError status 0: unreachable, or apiFetch's own timeout).
 * The two used to be collapsed into the same `return null`, which read fine at
 * this level and was wrong one level up: with the network down every call
 * "succeeded" with nothing, so the caller could not tell "these leads are
 * genuinely not retrievable" from "we never got to ask", and the once-per-session
 * hydration flag stayed set on a session that had hydrated nothing.
 *
 * A 404 still returns null, and still means keep the local copy: that is the
 * secret not matching (a legacy lead whose phone no longer gates it), which
 * retrying cannot fix.
 */
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
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) throw err;
    return null; // 404 (not found / secret mismatch) — keep local copy
  }
}

export async function refreshMyLeadsFromApi(): Promise<void> {
  // Admins/providers already get the authoritative list via hydrateLeadsFromApi.
  if (!isApiConfigured() || isAuthenticated()) return;
  const mineIds = new Set(readMine());
  // Account-owned rows are excluded: useAccountLeads pulls their live status
  // from GET /customer/leads, and the gate below has no secret that would let
  // them through anyway. See Lead.accountOwned.
  const mine = read().filter((l) => mineIds.has(l.id) && !l.accountOwned);
  if (mine.length === 0) return;

  const results = await Promise.allSettled(
    mine.map((l) => trackLead(l.refNumber, l.trackingToken, l.phone)),
  );
  const byRef = new Map<string, Lead>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) byRef.set(r.value.refNumber, r.value);
  }

  // Nothing came back AND at least one call never reached the server: this was a
  // connectivity failure, not an answer. Surface it, so the caller's
  // once-per-session guard releases and a later mount can try again. (A partial
  // success is still a success — we keep what landed and say nothing.)
  if (byRef.size === 0) {
    const unreachable = results.find((r) => r.status === "rejected");
    if (unreachable) throw (unreachable as PromiseRejectedResult).reason;
    return;
  }

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
  // Set for a request that came from the signed-in ACCOUNT, which carries no
  // tracking token — the same reason verifyLeadAmount takes these. Without it a
  // customer could read a completed request from another device but never
  // review it.
  account?: { leadId: string; owned: boolean },
): Promise<void> {
  if (isApiConfigured()) {
    if (account?.owned && !trackingToken) {
      await apiPost(`/customer/leads/${account.leadId}/review`, { rating, text });
    } else {
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
// a server-paginated list can refresh() afterward without racing the write. Rejects
// on failure — both callers wrap this in useMutation, which rolls back the optimistic
// change and shows an error toast; swallowing the error here used to leave that toast
// unreachable, so a failed save just silently reverted with no explanation.
export function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  write(read().map((l) => (l.id === id ? { ...l, status } : l))); // optimistic
  if (isApiConfigured() && isAuthenticated()) {
    return apiPatch(`/leads/${id}`, { status })
      .then(() => undefined)
      .catch((err) => {
        console.error("Lead status update failed:", err);
        void hydrateLeadsFromApi(); // reconcile from the server
        throw err;
      });
  }
  return Promise.resolve();
}

// ── Service completion + final price verification ──────────────────────────────

export interface LeadCompletionPayload {
  providerAmount: number;
  additionalWork: { description: string; amount: number } | null;
  notes?: string;
  attachments?: string[];
}

/**
 * Provider: fetch ONE of their own company's leads by id.
 *
 * The dashboard's other reads all go through the capped
 * `GET /provider/leads?pageSize=100` hydration below, which is fine for lists but
 * cannot answer "give me this lead". A page addressed by lead id then had only
 * two sources — whatever the previous route handed it via router state, and that
 * capped cache — so a reload (state gone) of a lead the cache never held reported
 * "not found" for a lead that exists. A lead the provider accepted off the
 * waiting list a moment ago is exactly that lead: it is created after the cache
 * was filled, and nothing refills it on an in-app navigation.
 *
 * Writes the result into the shared cache on the way out, with the same
 * trackingToken preservation every other lead write here performs.
 */
export async function fetchProviderLead(leadId: string): Promise<Lead> {
  const lead = await apiGet<Lead>(`/provider/leads/${leadId}`);
  const previous = read().find((l) => l.id === leadId);
  const merged = { ...lead, trackingToken: lead.trackingToken ?? previous?.trackingToken };
  write(previous ? read().map((l) => (l.id === leadId ? merged : l)) : [merged, ...read()]);
  return merged;
}

/** Provider: mark `leadId` (their own company's) completed with the final amount. */
export async function submitLeadCompletion(leadId: string, payload: LeadCompletionPayload): Promise<Lead> {
  const updated = await apiPost<Lead>(`/provider/leads/${leadId}/complete`, payload);
  // Same trackingToken-preservation as hydrateLeadsFromApi/refreshMyLeadsFromApi:
  // an admin/provider payload never carries it, so a blind overwrite would wipe
  // it on the rare device that is both this lead's provider AND its customer.
  write(read().map((l) =>
    l.id === leadId ? { ...updated, trackingToken: updated.trackingToken ?? l.trackingToken } : l,
  ));
  return updated;
}

export interface LeadVerificationPayload {
  ref: string;
  token?: string;
  phone?: string;
  decision: "confirmed" | "discrepancy";
  clientAmount?: number;
  note?: string;
  /**
   * The lead's id, used when the ACCOUNT is the credential rather than the
   * tracking token — see the account branch below.
   */
  leadId?: string;
  accountOwned?: boolean;
}

/**
 * Public: the client confirms or disputes the provider's reported final amount
 * for their own lead. Same ref+token trust model as submitReview.
 *
 * Except when there is no token to trust. A request pulled from the signed-in
 * account has none (GET /customer/leads never returns one) and the phone
 * fallback is refused for any lead that HAS a token stored server-side — so on
 * a browser that didn't itself submit the request, the public route can only
 * 404. That matters more here than anywhere else in this file: the price
 * verification is a mandatory, non-dismissible gate over the whole site, so a
 * customer signing in on a new browser with one pending would have been stuck
 * behind a screen that could never succeed. The account route resolves
 * ownership from the session instead.
 */
export async function verifyLeadAmount(payload: LeadVerificationPayload): Promise<Lead> {
  const { leadId, accountOwned, ...publicPayload } = payload;
  const updated =
    accountOwned && !payload.token && leadId
      ? await apiPost<Lead>(`/customer/leads/${leadId}/verify`, {
          decision: payload.decision,
          clientAmount: payload.clientAmount,
          note: payload.note,
        })
      : await apiPost<Lead>("/leads/verify", publicPayload);
  // trackingToken is never resent by the server (see hydrateLeadsFromApi's
  // comment) — carry this device's copy forward so chat/review access survives.
  write(read().map((l) =>
    l.refNumber === updated.refNumber ? { ...updated, trackingToken: updated.trackingToken ?? l.trackingToken } : l,
  ));
  return updated;
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
 * Fold the signed-in ACCOUNT's requests into this device's view.
 *
 * Deliberately merged into the same cache + "mine" list that everything else
 * already reads, rather than surfaced as a parallel list. `useMyLeads()` is
 * consumed by My Requests, the messages list and the price-verification gate;
 * a second source of truth would mean teaching all three about accounts and
 * getting the precedence right in each. This way they see the union and none of
 * them changes.
 *
 * `trackingToken` is preserved from whatever this device already holds: the
 * account endpoint never returns it (the account IS the credential there), and a
 * blind overwrite would strip the token from requests this browser submitted —
 * breaking the chat and review paths that still prove ownership with it. Same
 * hazard, and same fix, as the admin/provider hydration above.
 */
export function absorbAccountLeads(incoming: Lead[]): void {
  if (incoming.length === 0) return;

  const byId = new Map(read().map((l) => [l.id, l]));
  for (const lead of incoming) {
    const existing = byId.get(lead.id);
    byId.set(lead.id, {
      ...lead,
      trackingToken: lead.trackingToken ?? existing?.trackingToken,
      accountOwned: true,
    });
  }
  write([...byId.values()]);

  // Register them as this device's own, so useMyLeads() includes them.
  const mine = readMine();
  const merged = [...new Set([...incoming.map((l) => l.id), ...mine])];
  if (merged.length !== mine.length) {
    localStorage.setItem(MINE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

/**
 * Drop everything that came from the ACCOUNT, leaving only what this device
 * itself submitted.
 *
 * Called on sign-out. The account's requests are folded into the same local
 * cache as this browser's own (see absorbAccountLeads — that sharing is what
 * lets every screen stay account-agnostic), so signing out has to unpick it or
 * the next person to use the browser reads the last person's request history
 * off a signed-out page. A request this device submitted itself stays: it was
 * here before any account was, and it is still legitimately this browser's.
 */
export function forgetAccountLeads(): void {
  const all = read();
  // Nothing came from an account — don't rewrite storage or fire a change event
  // for a no-op. clearSession() calls this on every 401, which for a signed-out
  // visitor is once per page load.
  if (!all.some((l) => l.accountOwned)) return;

  const kept = all.filter((l) => !l.accountOwned);
  const keptIds = new Set(kept.map((l) => l.id));
  write(kept);
  localStorage.setItem(
    MINE_KEY,
    JSON.stringify(readMine().filter((id) => keptIds.has(id))),
  );
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Drop everything a STAFF session pulled onto this device, keeping only what this
 * browser submitted itself.
 *
 * The staff counterpart of forgetAccountLeads above, called from lib/auth.ts on
 * sign-out and on an expired session. Until it existed, staff sign-out cleared
 * the cached profile and nothing else, so `hydrateLeadsFromApi`'s page of 100
 * leads — every one of them carrying a real customer's name, phone, district and
 * budget — simply stayed in localStorage for whoever used the browser next. The
 * visible symptom was provider B seeing provider A's leads for the frame before
 * their own hydration landed.
 *
 * "Mine" is the same definition every other function here uses: an id in
 * MINE_KEY. A lead can be BOTH (an admin who also submitted a request from this
 * machine — the trackingToken preservation throughout this file exists for
 * exactly that overlap), and in that case it is kept, because it was this
 * device's before any staff session touched it.
 */
export function forgetStaffLeads(): void {
  const mineIds = new Set(readMine());
  const all = read();
  const kept = all.filter((l) => mineIds.has(l.id));
  // Nothing to do — don't rewrite storage or fire a change event for a no-op.
  // clearSession() runs on every sign-out, including ones where no staff
  // hydration ever happened.
  if (kept.length === all.length) return;
  write(kept);
}

/**
 * This device's leads reduced to what the chat endpoints need to prove ownership.
 *
 * A customer has no account: the reference number plus its tracking token IS the
 * credential. Kept here rather than in the chat module because this file owns
 * what "my requests" means, and the messages list must be exactly that set.
 */
export interface MyLeadClaim {
  ref: string;
  token?: string;
}

/**
 * The phone number is deliberately NOT included any more.
 *
 * Both endpoints these claims are sent to — POST /chat/summaries and the
 * account handover — are BATCH endpoints, and the API stopped accepting the
 * legacy phone-tail fallback on those: 50 (reference, phone) pairs per request
 * turned a phone number, which is not a secret, into a way to enumerate
 * somebody's requests. Sending a value the server now ignores would leave a
 * real phone number travelling in a payload for no purpose at all.
 *
 * Practical effect: a lead old enough to predate `trackingToken` no longer
 * appears in the messages list or attaches to an account. It is still reachable
 * one at a time through the tracking page, which kept the fallback.
 */
function toClaim(l: Lead): MyLeadClaim {
  return { ref: l.refNumber, token: l.trackingToken };
}

/**
 * The same set, read once instead of subscribed to. For callers outside React —
 * the account handover fires from an effect and needs the claims as they are at
 * that moment, not a value that changes identity on every render.
 */
export function getMyLeadClaims(): MyLeadClaim[] {
  return getMyLeads().map(toClaim);
}

export function useMyLeadClaims(): MyLeadClaim[] {
  const mine = useMyLeads();
  return mine.map(toClaim);
}

export function useMyLeads(): Lead[] {
  const all = useLeads();
  const [mineIds, setMineIds] = useState<Set<string>>(() => new Set(readMine()));
  useEffect(() => {
    const refresh = () => setMineIds(new Set(readMine()));
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Pull live status for this device's submissions (once per session).
    //
    // The flag is set BEFORE the call so concurrent mounts don't each fire one —
    // but it used never to be cleared again, which quietly turned "once per
    // session" into "at most one ATTEMPT per session". A hydration that failed
    // (offline at the moment the page loaded, a timeout, a 500) left "My
    // Requests" pinned to whatever localStorage happened to hold, for the rest
    // of the page's life, with nothing able to retry it. Releasing it on failure
    // keeps the dedupe for the success path — which is all it was ever for —
    // while letting the next mount, or a manual refresh, try again.
    if (!myLeadsHydrated) {
      myLeadsHydrated = true;
      void refreshMyLeadsFromApi()
        .catch((err: unknown) => {
          myLeadsHydrated = false;
          reportHydrationFailure("My-requests hydration from API", err);
        })
        .finally(markMyLeadsHydrationSettled);
    }
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return all.filter((l) => mineIds.has(l.id));
}

/**
 * True once this device's one-time server hydration (see useMyLeads above) has
 * settled — i.e. once we can actually trust `useMyLeads()` to reflect the
 * server's view rather than whatever was cached before the last visit.
 * RootLayout holds first paint on this so the price-verification gate can
 * never render "no pending verification" just because the network call hasn't
 * come back yet. Must be used alongside a mounted useMyLeads() (or another
 * caller of refreshMyLeadsFromApi) — this hook only listens, it doesn't trigger.
 */
export function useMyLeadsHydrated(): boolean {
  const [settled, setSettled] = useState(myLeadsHydrationSettled);
  useEffect(() => {
    if (settled) return;
    const listener = () => setSettled(true);
    myLeadsHydrationListeners.add(listener);
    return () => { myLeadsHydrationListeners.delete(listener); };
  }, [settled]);
  return settled;
}
