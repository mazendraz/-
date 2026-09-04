/**
 * Saved / shortlisted companies ("المفضلة").
 *
 * ── What changed, and why ───────────────────────────────────────────────────
 * This used to be device-local and nothing else: an AsyncStorage list, mirroring
 * the website's localStorage one. That meant the same account had a different
 * shortlist on every client it was signed into, which is the one piece of
 * per-customer state that never reached the database.
 *
 * Favorites are now ACCOUNT data (api's CustomerFavorite, keyed by the
 * canonical customerId). AsyncStorage stays, but demoted to what it should
 * always have been: a cache that makes the Saved screen paint instantly and
 * keeps the feature working for a signed-out visitor. The server is the source
 * of truth the moment there is an account to ask.
 *
 *   signed out → local list only (unchanged behaviour)
 *   signed in  → server list, mirrored into the cache after every read/write
 *
 * ── The sign-in merge ───────────────────────────────────────────────────────
 * A visitor who saved companies before making an account must not lose them, so
 * the first read after sign-in hands the local list to the server, which folds
 * it in ADDITIVELY and answers with the union. Additive matters: a local
 * absence is not evidence of a removal — it may just be a company saved on
 * another device — so an old phone can never wipe a shortlist built elsewhere.
 * The server's `@@unique([customerId, companyId])` makes replaying the merge
 * harmless.
 *
 * ── Staying in step ─────────────────────────────────────────────────────────
 * The API emits a customer-scoped `favorite` event on every change, and
 * app/_layout.tsx feeds those into refreshFromServer(), so favouriting on the
 * web updates this app without a refresh. Nothing here polls.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiDelete, apiGet, apiPost } from "@alassema/mobile-shared";
import { getCustomer } from "./customerAuth";

const KEY = "al-assema-saved";
const listeners = new Set<() => void>();

/** Last list we believe in — server's when signed in, this device's otherwise. */
let cache: string[] | null = null;

// ── How long a resolved list counts as current ──────────────────────────────
// `read()` is called by every mounted subscriber's `sync`, and `sync` runs
// again on every notify — so a single favourite toggle used to fan out into
// one `GET /customer/favorites` per subscriber, all of them asking the same
// question about a list the notify had just handed them. A notify already
// carries the new value; anything asking again within a few seconds of a
// confirmed read is asking for what it was just told.
//
// Short on purpose: this is a shortlist a person edits by hand, and the
// server-pushed `favorite` event (app/_layout.tsx → refreshFromServer) is
// what keeps it live across devices — this window only collapses the burst
// that a single change produces locally.
const FRESH_MS = 10_000;
/** When `cache` was last resolved (from the server, or from disk when signed out). */
let freshAt = 0;
/** The one read in flight, so concurrent subscribers share it instead of racing. */
let inFlight: Promise<string[]> | null = null;
/** Whose list that in-flight read is about — a read started as one account
 *  must never be handed to the next one. */
let inFlightOwner: string | null | undefined;
/** Identity of the in-flight read, so it only ever clears its OWN slot: a read
 *  for a newer owner may have replaced it while this one was still running. */
let inFlightToken: object | null = null;

/**
 * The cache records WHOSE list it is.
 *
 * Without an owner, one phone's storage key would serve a guest, then an
 * account, then whoever signed in next — and signing out would leave the
 * previous customer's saved companies on screen for the following one. Stamping
 * the owner lets a read decide for itself whether the cached list is even
 * about the current viewer, which keeps this module self-contained: the
 * alternative was customerAuth calling in to clear it on sign-out, and since
 * this module already reads customerAuth that would have been an import cycle.
 *
 * `owner: null` is the guest list, and is exactly what the pre-account format
 * (a bare string[]) is read as — so an upgrade keeps a visitor's saves.
 */
interface CachedList {
  owner: string | null;
  slugs: string[];
}

async function readCache(): Promise<CachedList> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { owner: null, slugs: [] };
    const parsed = JSON.parse(raw) as unknown;
    // Pre-account format: a bare array, which was always this device's guest list.
    if (Array.isArray(parsed)) return { owner: null, slugs: parsed as string[] };
    const obj = parsed as Partial<CachedList>;
    return {
      owner: typeof obj.owner === "string" ? obj.owner : null,
      slugs: Array.isArray(obj.slugs) ? obj.slugs : [],
    };
  } catch {
    return { owner: null, slugs: [] };
  }
}

/** This device's list for the CURRENT viewer, or empty if the cache is someone else's. */
async function readLocal(): Promise<string[]> {
  const cached = await readCache();
  const owner = getCustomer()?.id ?? null;
  return cached.owner === owner ? cached.slugs : [];
}

function sameSlugs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((slug, i) => slug === b[i]);
}

/**
 * ⚠️ Notifying UNCONDITIONALLY here was an unbounded request loop.
 *
 * `read()` below ends in `writeLocal(server)`, and every mounted useIsSaved /
 * useSavedSlugs registers its own `sync` — which calls `read()` — in
 * `listeners`. So one signed-in company profile was enough to close the
 * circle: read → writeLocal → notify → read → writeLocal → notify, one
 * `GET /customer/favorites` per lap, for as long as the screen stayed
 * mounted. With two subscribers each lap notified both, so the laps
 * MULTIPLIED rather than merely repeating. Reproduced with the network and
 * AsyncStorage stubbed out: a single subscriber passed 5000 requests without
 * ever yielding to the timer queue.
 *
 * The list itself is stable across those laps, so comparing before notifying
 * cuts the cycle at the first lap without changing what any subscriber ever
 * sees: a listener only exists to be told the list CHANGED, and re-running it
 * for an identical list was never information.
 */
async function writeLocal(slugs: string[]): Promise<void> {
  const changed = cache === null || !sameSlugs(cache, slugs);
  cache = slugs;
  freshAt = Date.now();
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ owner: getCustomer()?.id ?? null, slugs } satisfies CachedList),
    );
  } catch {
    // A cache that cannot be written is still a working session — the server
    // has the list, and the next read re-fetches it.
  }
  if (changed) listeners.forEach((l) => l());
}

/** Has this account's local list already been folded into the server's? */
let mergedFor: string | null = null;

/**
 * The account's list from the server, merging this device's local one the first
 * time it runs for a given account. Returns null when signed out (caller falls
 * back to local) or when the request fails — a network blip must leave the
 * cached list on screen rather than blanking the Saved tab.
 */
async function pullFromServer(): Promise<string[] | null> {
  const customer = getCustomer();
  if (!customer) return null;
  try {
    if (mergedFor !== customer.id) {
      const local = await readLocal();
      mergedFor = customer.id;
      const res = await apiPost<{ slugs: string[] }>("/customer/favorites", { merge: local });
      return res.slugs;
    }
    const res = await apiGet<{ slugs: string[] }>("/customer/favorites");
    return res.slugs;
  } catch {
    // Let a failed merge be retried by the next call rather than pinning this
    // session to a half-done state.
    if (mergedFor === customer.id) mergedFor = null;
    return null;
  }
}

/** Re-read the authoritative list and update the cache. Safe to call often. */
export async function refreshFromServer(): Promise<void> {
  const slugs = await pullFromServer();
  if (slugs) await writeLocal(slugs);
}

/**
 * Forget this session's merge marker and cached list.
 *
 * ⚠️ Currently has NO caller, and its comment used to claim otherwise ("called
 * on sign-out"). Sign-out cannot call it: customerAuth.ts would have to import
 * this module, which already imports customerAuth — the exact cycle the owner
 * stamp above exists to avoid. What actually protects the next account is
 * `read()`'s own owner check, which drops the cache (and its freshness stamp)
 * the moment `getCustomer()` returns someone else. Kept as the explicit escape
 * hatch for a caller that can reach it without the cycle.
 */
export function resetSavedCache(): void {
  mergedFor = null;
  cache = null;
  freshAt = 0;
  listeners.forEach((l) => l());
}

/** Whose list `cache` currently holds — same question readCache answers on disk. */
let cacheOwner: string | null | undefined;

async function read(): Promise<string[]> {
  const owner = getCustomer()?.id ?? null;
  if (cacheOwner !== owner) {
    // Signed out, or a different account signed in: the in-memory list is not
    // about this viewer. Drop it rather than showing it for one frame.
    cache = null;
    cacheOwner = owner;
    freshAt = 0;
  }

  // Already answered, recently — see FRESH_MS. This is what turns "every
  // subscriber re-reads on every notify" from N requests into none.
  if (cache && Date.now() - freshAt < FRESH_MS) return cache;
  // Someone else is already asking; join them rather than opening a second
  // request for the same answer — but only if they are asking about the SAME
  // viewer. A read started before a sign-out must not be handed to whoever
  // comes next.
  if (inFlight && inFlightOwner === owner) return inFlight;

  const token = {};
  inFlightOwner = owner;
  inFlightToken = token;
  inFlight = (async () => {
    try {
      const server = await pullFromServer();
      // Signing out (or switching accounts) mid-request. Writing here would
      // stamp THIS viewer's owner onto the previous one's slugs — a shortlist
      // silently inherited across accounts, which is the exact thing the owner
      // stamp exists to prevent. This window is narrow but it is the same one
      // an expired session produces, so it is not merely theoretical.
      if ((getCustomer()?.id ?? null) !== owner) return cache ?? [];
      if (server) {
        await writeLocal(server); // stamps freshAt
        return server;
      }
      const local = await readLocal();
      cache = local;
      freshAt = Date.now();
      return local;
    } finally {
      // Only clear the slot if it is still OURS — a read for a newer owner may
      // have replaced it while this one was in flight.
      if (inFlightToken === token) {
        inFlight = null;
        inFlightOwner = undefined;
        inFlightToken = null;
      }
    }
  })();
  return inFlight;
}

export async function isSaved(slug: string): Promise<boolean> {
  return (await read()).includes(slug);
}

/**
 * Save or unsave, and report the new state.
 *
 * Writes locally FIRST so the heart flips under the finger, then tells the
 * server and adopts its answer — which is what corrects the optimistic guess if
 * another device changed the same list a moment ago. A failed request leaves
 * the optimistic value in the cache; the next `favorite` event or screen focus
 * reconciles it, and for a signed-out visitor the local write IS the truth.
 */
export async function toggleSaved(slug: string): Promise<boolean> {
  const current = cache ?? (await readLocal());
  const wantSaved = !current.includes(slug);
  const optimistic = wantSaved ? [...current, slug] : current.filter((s) => s !== slug);
  await writeLocal(optimistic);

  if (!getCustomer()) return wantSaved;

  try {
    const res = wantSaved
      ? await apiPost<{ slugs: string[] }>("/customer/favorites", { slug })
      : await apiDelete<{ slugs: string[] }>("/customer/favorites", { slug });
    await writeLocal(res.slugs);
    return res.slugs.includes(slug);
  } catch {
    return wantSaved;
  }
}

/** Reactive saved-state for one company — for the heart toggle on a card/profile. */
export function useIsSaved(slug: string): { saved: boolean; toggle: () => void } {
  const [saved, setSaved] = useState(false);

  const sync = useCallback(() => {
    read().then((slugs) => setSaved(slugs.includes(slug)));
  }, [slug]);

  useEffect(() => {
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [sync]);

  return { saved, toggle: () => void toggleSaved(slug) };
}

/** The full saved list, reactive — for a Saved screen. */
export function useSavedSlugs(): string[] {
  const [slugs, setSlugs] = useState<string[]>([]);

  const sync = useCallback(() => {
    read().then(setSlugs);
  }, []);

  useEffect(() => {
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [sync]);

  return slugs;
}
