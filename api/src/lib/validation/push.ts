// Zod schemas for Web Push subscription endpoints. The shape mirrors the browser's
// PushSubscription.toJSON() (endpoint + keys.p256dh + keys.auth).
import { z } from "zod";

/**
 * Hosts that are actually push services.
 *
 * `endpoint` is a URL the CLIENT supplies and the SERVER later POSTs to, on every
 * new lead and every chat message (see push.service.ts sendToSubs). Validating it
 * as "a URL" and nothing more made that a server-side request forgery primitive:
 * a PROVIDER — a third-party company, not staff — could register
 * `http://127.0.0.1:3000/…` or `http://169.254.169.254/…` and have the server
 * reach it from inside the trust boundary.
 *
 * The response body is discarded, so this is blind — but sendToSubs branches on
 * the status code (404/410 silently prunes the row, anything else is logged with
 * its code), which is enough of an oracle to fingerprint internal services one
 * notification at a time.
 *
 * A browser only ever hands out endpoints on these four families, so an allowlist
 * costs nothing legitimate. Chrome, Edge, Opera, Brave and Samsung Internet all
 * go through FCM.
 *
 * Matched as anchored HOST suffixes, deliberately: `evil.com/fcm.googleapis.com`
 * is a path rather than a host, and `fcm.googleapis.com.evil.com` must not match
 * either. Testing `url.hostname` (not the raw string) is what makes both true.
 */
const PUSH_SERVICE_HOSTS = [
  /(^|\.)googleapis\.com$/, // Chrome · Edge · Opera · Brave · Samsung (FCM)
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Windows / legacy Edge (WNS)
  /(^|\.)push\.apple\.com$/, // Safari
];

/** True when `value` is an https URL on a known push service. Exported for testing. */
export function isPushServiceEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // https only. A plaintext endpoint is never a real push service, and http is
  // the form every internal-service probe takes.
  if (url.protocol !== "https:") return false;
  return PUSH_SERVICE_HOSTS.some((re) => re.test(url.hostname));
}

export const pushSubscribeSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine(isPushServiceEndpoint, "Not a recognised push service endpoint"),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

/**
 * Unsubscribe deliberately does NOT apply the allowlist.
 *
 * It is a DELETE scoped to `userId`, so it never causes an outbound request and
 * carries no SSRF risk — the allowlist above exists to constrain what the server
 * will later POST to, and nothing here is ever POSTed to. Applying it anyway would
 * only mean a row stored before the allowlist existed could no longer be cleaned
 * up by the device that owns it, which is a bug with no security upside.
 */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});
