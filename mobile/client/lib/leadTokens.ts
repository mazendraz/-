/**
 * Local store of each lead's `trackingToken`, keyed by refNumber — the mobile
 * counterpart of how the website's requests.ts folds `trackingToken` into its
 * localStorage-cached Lead record at creation and reuses it later.
 *
 * Why this has to exist at all: `/leads/verify` (and every other public
 * ref+secret endpoint) is gated by `leadSecretMatches()` on the server
 * (api's leads.service.ts) — and that function checks `token` ONLY whenever
 * the lead has one on record, which is every lead created through the
 * current flow (`generateTrackingToken()` runs unconditionally on creation).
 * The account (`fetchAccountLeads()`) never carries the token back (same
 * contract as admin/provider payloads), so this device's own copy from the
 * moment of submission is the only way to act on that lead later.
 *
 * ── Why SecureStore, and why split across two stores ────────────────────────
 * These tokens are BEARER CREDENTIALS. Holding one grants read access to a
 * request, its private conversation with the provider, its one-time review and
 * its final-price verification — which is why the API treats it as the whole
 * credential on the public tracking path. They were previously kept in
 * AsyncStorage, which on Android is an unencrypted file in the app sandbox and
 * is eligible for Android Auto Backup / `adb backup` extraction, and on iOS
 * rides along in an unencrypted iTunes/iCloud backup. Session tokens in this
 * app already live in SecureStore (see session.ts); there is no reason these
 * should not.
 *
 * The split is forced by a real constraint rather than taste: expo-secure-store
 * documents a ~2048-byte ceiling per VALUE, and one JSON blob holding every
 * lead this device ever created is unbounded. So each token is its own entry
 * (a fixed ~24 bytes, never near the limit), and the list of which reference
 * numbers exist stays in AsyncStorage — a reference number on its own is not a
 * secret (the API refuses a lookup without the token; see leadSecretMatches),
 * so it does not need the stronger tier.
 *
 * Web has no SecureStore at all — same platform gap session.ts documents — so
 * it falls back to the same store the index uses. That is a development and
 * render-check surface, not a shipped product.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** Index of known reference numbers. Not a secret — see the module comment. */
const INDEX_KEY = "al-assema-lead-refs";
/** Legacy single-blob store this module used to keep everything in. */
const LEGACY_KEY = "al-assema-lead-tokens";

const SECURE_AVAILABLE = Platform.OS !== "web";

/**
 * SecureStore keys accept alphanumerics plus ".", "-" and "_" only. A reference
 * number is `AA-YYYYMMDD-XXXX` (see api's refNumber.ts), which already fits —
 * but it is sanitized anyway rather than trusted, since the value ultimately
 * comes off the wire.
 */
function tokenKey(refNumber: string): string {
  return `al-assema-lead-token.${refNumber.replace(/[^A-Za-z0-9.\-_]/g, "_")}`;
}

async function readToken(refNumber: string): Promise<string | undefined> {
  const key = tokenKey(refNumber);
  try {
    const value = SECURE_AVAILABLE
      ? await SecureStore.getItemAsync(key)
      : await AsyncStorage.getItem(key);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

async function writeToken(refNumber: string, token: string): Promise<void> {
  const key = tokenKey(refNumber);
  if (SECURE_AVAILABLE) await SecureStore.setItemAsync(key, token);
  else await AsyncStorage.setItem(key, token);
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}

async function writeIndex(refs: string[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(refs));
}

/**
 * Move anything left in the old single-blob AsyncStorage entry into the new
 * layout, then delete it.
 *
 * Runs at most once per install and is best-effort: a device that fails this
 * simply keeps the tokens it can still read. Deleting the old key matters as
 * much as copying it — leaving the plaintext copy behind would mean the whole
 * point of this change (get the credentials out of backup-eligible storage)
 * never actually happened for anyone who already had requests.
 */
let migrated: Promise<void> | null = null;
function migrateLegacyBlob(): Promise<void> {
  migrated ??= (async () => {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(LEGACY_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const refs = new Set(await readIndex());
      for (const [refNumber, token] of Object.entries(map)) {
        if (typeof token !== "string" || !token) continue;
        await writeToken(refNumber, token);
        refs.add(refNumber);
      }
      await writeIndex([...refs]);
    } catch {
      // Corrupt blob — nothing to salvage, and keeping it around helps nobody.
    }
    await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
  })();
  return migrated;
}

/** Remember a lead's tracking token, captured from the creation response. */
export async function rememberLeadToken(refNumber: string, token: string): Promise<void> {
  await migrateLegacyBlob();
  await writeToken(refNumber, token);
  const refs = await readIndex();
  if (!refs.includes(refNumber)) await writeIndex([...refs, refNumber]);
}

/** This device's own copy of a lead's token, if it was the one that created it. */
export async function getLeadToken(refNumber: string): Promise<string | undefined> {
  await migrateLegacyBlob();
  return readToken(refNumber);
}

/**
 * Everything this device knows how to prove, in the shape /customer/leads/claim
 * wants — see claimDeviceLeads() in customerLeads.ts for why that matters.
 *
 * A reference in the index whose token has gone missing is skipped rather than
 * sent with an empty secret: the API's batch claim takes the token as the only
 * credential (the legacy phone fallback is not accepted there), so a tokenless
 * entry could never do anything but be rejected.
 */
export async function allLeadTokens(): Promise<{ refNumber: string; token: string }[]> {
  await migrateLegacyBlob();
  const refs = await readIndex();
  const out: { refNumber: string; token: string }[] = [];
  for (const refNumber of refs) {
    const token = await readToken(refNumber);
    if (token) out.push({ refNumber, token });
  }
  return out;
}
