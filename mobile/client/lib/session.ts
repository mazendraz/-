/**
 * Where the tokens live on-device.
 *
 * expo-secure-store, not AsyncStorage: it's backed by iOS Keychain and Android
 * Keystore — hardware-backed on most devices — rather than a plain file any
 * app with storage access could in principle read. The refresh token lives
 * here for up to 60 days (see api's customerSession.service comment on
 * REFRESH_TTL_MS); AsyncStorage is the wrong tier of trust for that.
 *
 * Mirrors the website's customerAuth.ts one level down: that module owns
 * SESSION STATE (what customer is signed in, broadcasting changes to
 * useCustomerAuth); this owns STORAGE (getting bytes on and off the device).
 * The split matters here in a way it doesn't on the web, because the web has
 * exactly one storage primitive and the app has two — SecureStore for secrets,
 * a plain key for the non-secret cached profile — and mixing that concern into
 * the state module would make it non-obvious which write needs which.
 */
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "al-assema-access-token";
const REFRESH_TOKEN_KEY = "al-assema-refresh-token";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  // Sequential, not Promise.all: if the refresh token write fails after the
  // access token succeeds, the caller sees a rejection and can retry — one
  // partial state (access saved, refresh missing) is recoverable by re-running
  // this function, whereas the two writes racing is not a scenario that needs
  // to exist for no benefit.
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/** Update just the access token — what a successful refresh does. */
export async function saveAccessToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
