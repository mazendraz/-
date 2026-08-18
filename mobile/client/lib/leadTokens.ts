/**
 * Local cache of each lead's `trackingToken`, keyed by refNumber — the mobile
 * counterpart of how the website's requests.ts folds `trackingToken` into its
 * localStorage-cached Lead record at creation and reuses it later.
 *
 * Why this has to exist at all: `/leads/verify` (and every other public
 * ref+secret endpoint) is gated by `leadSecretMatches()` on the server
 * (api's leads.service.ts) — and that function checks `token` ONLY whenever
 * the lead has one on record, which is every lead created through the
 * current flow (`generateTrackingToken()` runs unconditionally on creation).
 * The `phone` fallback that endpoint's schema also accepts is for genuinely
 * legacy leads (trackingToken == null) — sending a phone for a normal lead
 * with no token gets a 404, not a match. The account (`fetchAccountLeads()`)
 * never carries the token back (same contract as admin/provider payloads),
 * so this device's own copy from the moment of submission is the only way
 * to act on that lead later — same limitation the website already has with
 * its localStorage cache: a reinstall/new device with no cached token can't
 * self-verify either, until there's an account-based endpoint that doesn't
 * need one.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "al-assema-lead-tokens";

async function read(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Remember a lead's tracking token, captured from the creation response. */
export async function rememberLeadToken(refNumber: string, token: string): Promise<void> {
  const map = await read();
  map[refNumber] = token;
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

/** This device's own copy of a lead's token, if it was the one that created it. */
export async function getLeadToken(refNumber: string): Promise<string | undefined> {
  return (await read())[refNumber];
}
