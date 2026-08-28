// Stateless, signed unsubscribe tokens — no DB column, no migration.
//
// A marketing email's unsubscribe link has to work with NO login (the reader
// may never open the app again, which is rather the point) and without a
// one-time-use token to store and expire (CAN_SPAM/GDPR both expect an
// unsubscribe link to keep working, not to be a single-use secret). An HMAC
// over the customer id, keyed by a server-only secret, gives both for free:
// anyone holding the token can flip THEIR OWN marketingEmailEnabled off and
// nothing else — it is not a bearer credential for the account.
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/utils/token";

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) {
    throw new Error(
      "UNSUBSCRIBE_SECRET is not set — required to sign/verify unsubscribe links.",
    );
  }
  return s;
}

function sign(customerId: string): string {
  return createHmac("sha256", secret()).update(customerId).digest("base64url").slice(0, 32);
}

/** `<customerId>.<signature>` — opaque to the reader, verifiable by us. */
export function signUnsubscribeToken(customerId: string): string {
  return `${customerId}.${sign(customerId)}`;
}

/** Returns the customer id if the token is well-formed and the signature
 *  matches, else null. Never throws on a malformed token — a bad/tampered
 *  link should read as "invalid", not 500. */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const customerId = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  let expectedSig: string;
  try {
    expectedSig = sign(customerId);
  } catch {
    return null;
  }
  return safeEqual(providedSig, expectedSig) ? customerId : null;
}
