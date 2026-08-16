/**
 * Holding a half-finished request across the trip to sign-in.
 *
 * The request form is gated at SEND, not at open: the customer fills all four
 * steps as a visitor and only meets the sign-in wall when they press the button.
 * That is the lowest-abandonment place to put it — the work is already done, so
 * almost nobody walks away — but it only holds if the work actually survives.
 * Coming back to a blank form after signing in is worse than having been asked
 * up front, because now they have to do it twice.
 *
 * ── sessionStorage, not localStorage ─────────────────────────────────────────
 * This carries a name, a phone number and a description of someone's home. It
 * exists for the ninety seconds it takes to sign in, and sessionStorage is
 * scoped to exactly that: the one tab, cleared when it closes. In localStorage
 * the same record would sit on a possibly-shared machine indefinitely, long
 * after it stopped being useful to anyone.
 */
import type { CartItem } from "./cart";

const KEY = "al-assema-pending-request";

export interface PendingRequest {
  companySlug: string;
  companyName: string;
  form: {
    name: string;
    phone: string;
    district: string;
    description: string;
    service: string;
  };
  items: CartItem[];
  /** Epoch ms — a stale record is dropped rather than resurrected. */
  savedAt: number;
}

// Long enough for a sign-in that goes wrong once and gets retried; short enough
// that a record can't outlive the intent behind it.
const MAX_AGE_MS = 30 * 60 * 1000;

export function savePendingRequest(pending: Omit<PendingRequest, "savedAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...pending, savedAt: Date.now() }));
  } catch {
    // Private-browsing quota or a disabled store. The sign-in still works; the
    // customer just retypes. Failing the send over this would be worse.
  }
}

/**
 * Read and REMOVE the pending request in one step.
 *
 * Consuming rather than peeking is what stops it being replayed: the restore
 * path submits, and a record that survived that would re-submit on the next
 * refresh. There is exactly one reader and it takes the record with it.
 */
export function takePendingRequest(): PendingRequest | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);

    const parsed = JSON.parse(raw) as PendingRequest;
    if (!parsed?.form || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingRequest(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up if the store is unavailable */
  }
}
