/**
 * Long-lived device sessions for the mobile apps: refresh tokens, rotation,
 * reuse detection, and revocation.
 *
 * The access token stays a stateless JWT — fast to verify, impossible to revoke.
 * This module supplies the other half: a credential that CAN be revoked, so
 * "sign out this device" and "sign out everywhere" mean something, and a stolen
 * token has a short useful life instead of an indefinite one.
 *
 * Nothing here is used by the website. See the note on CustomerSession in
 * schema.prisma for why handing a browser a refresh token would be a downgrade.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/utils/errors";
import * as audit from "@/lib/services/audit.service";

/** How long a device stays signed in without ever opening the app. */
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * How long a just-rotated token keeps working.
 *
 * Sized for a dropped RESPONSE, not for convenience: the server rotated, the
 * reply was lost, the app retries. That round trip is seconds. Anything much
 * longer widens the window in which a stolen token still works; anything
 * shorter starts signing people out over ordinary mobile packet loss.
 */
const ROTATION_GRACE_MS = 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export interface DeviceInfo {
  deviceName?: string;
  platform?: string;
}

export interface IssuedSession {
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Has this exact (deviceName, platform) pair ever opened a session for this
 * customer before? Includes revoked/expired sessions on purpose — a device
 * that signed out months ago and is signing back in is a RETURNING device,
 * not a new one; only a name+platform this account has genuinely never seen
 * counts. Used to gate the new-device-login security email (see
 * customerSignIn.ts) — deliberately loose matching (a display name a client
 * chose, not a hardware id), which is exactly what that email needs: "have
 * we told this person about this device before", not device fingerprinting.
 */
export async function hasSeenDevice(customerId: string, device: DeviceInfo): Promise<boolean> {
  const existing = await prisma.customerSession.findFirst({
    where: { customerId, deviceName: device.deviceName ?? null, platform: device.platform ?? null },
    select: { id: true },
  });
  return existing !== null;
}

/** Open a new device session and return its refresh token (shown once). */
export async function issue(
  customerId: string,
  device: DeviceInfo = {},
): Promise<IssuedSession> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const session = await prisma.customerSession.create({
    data: {
      customerId,
      tokenHash: hash,
      // Truncated, not validated: these are display labels a client chose, and
      // an unbounded string from an untrusted caller has no business being
      // written at full length.
      deviceName: device.deviceName?.slice(0, 80) || null,
      platform: device.platform?.slice(0, 16) || null,
      expiresAt,
    },
    select: { id: true },
  });

  return { refreshToken: token, sessionId: session.id, expiresAt };
}

export interface RefreshResult {
  customerId: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Exchange a refresh token for a fresh one.
 *
 * Three outcomes, and the middle one is the reason this is not a one-liner:
 *
 *  1. **Current token** → rotate. A new token is issued, the presented one moves
 *     into the grace slot, and the old grace token stops working.
 *
 *  2. **Previous token, inside the grace window** → the dropped-response retry.
 *     Answered with a working token instead of a sign-out.
 *
 *     Note it issues a FRESH token rather than replaying the current one: only
 *     the hash of that is stored, so it cannot be reconstructed here. The token
 *     it would have replayed is orphaned — nobody holds it, since the response
 *     carrying it is precisely what got lost. Same outcome for the client, and
 *     it keeps one dropped packet from ending the session.
 *
 *  3. **Previous token, after the grace window** → REUSE DETECTED. The real
 *     device rotated past this token long ago, so a second party is holding a
 *     copy. The session is revoked outright — including the token the thief
 *     doesn't have — because the alternative is letting whoever stole it keep
 *     refreshing alongside the legitimate device indefinitely. The customer
 *     signs in again on that device; the attacker gets nothing.
 */
export async function refresh(presented: string, ip?: string): Promise<RefreshResult> {
  const hash = hashToken(presented);

  const session = await prisma.customerSession.findFirst({
    where: { OR: [{ tokenHash: hash }, { previousTokenHash: hash }] },
    select: {
      id: true,
      customerId: true,
      tokenHash: true,
      previousTokenHash: true,
      previousUsableTo: true,
      expiresAt: true,
      revokedAt: true,
      customer: { select: { isActive: true } },
    },
  });

  // One message for every failure: unknown token, revoked session, expired
  // session, deactivated account. Which one it was is not something an
  // unauthenticated caller should be able to learn.
  const dead =
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date() ||
    !session.customer.isActive;
  if (dead) throw new UnauthorizedError("Session expired. Please sign in again.");

  const isCurrent = session.tokenHash === hash;

  if (!isCurrent) {
    const withinGrace =
      session.previousUsableTo !== null && session.previousUsableTo > new Date();

    if (!withinGrace) {
      // ── Reuse detected ──────────────────────────────────────────────────
      await prisma.customerSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await audit.recordAuth({
        action: "auth.customer.session.reuse",
        email: "-",
        userId: session.customerId,
        ip,
        meta: { sessionId: session.id },
      });
      throw new UnauthorizedError("Session expired. Please sign in again.");
    }

    // Inside the grace window: treat it as the retry it almost certainly is and
    // hand back a usable token. See outcome 2 in the docblock for why this
    // mints a fresh one rather than replaying the current.
    return rotate(session.id, session.customerId, hash);
  }

  return rotate(session.id, session.customerId, hash);
}

/** Issue the next token, retiring `presentedHash` into the grace slot. */
async function rotate(
  sessionId: string,
  customerId: string,
  presentedHash: string,
): Promise<RefreshResult> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.customerSession.update({
    where: { id: sessionId },
    data: {
      tokenHash: hash,
      previousTokenHash: presentedHash,
      previousUsableTo: new Date(Date.now() + ROTATION_GRACE_MS),
      lastUsedAt: new Date(),
      // Each use extends the session — an app in daily use never expires, one
      // abandoned for two months does.
      expiresAt,
    },
  });

  return { customerId, refreshToken: token, sessionId, expiresAt };
}

/** End one session. Idempotent, and scoped to the owner so one customer can
 *  never revoke another's device by guessing an id. */
export async function revoke(customerId: string, sessionId: string): Promise<void> {
  await prisma.customerSession.updateMany({
    where: { id: sessionId, customerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * End every session for this customer — "sign out everywhere".
 *
 * Moves the ACCOUNT-WIDE token floor as well as revoking the session rows, and
 * that second half is what makes the phrase true. Revoking sessions alone kills
 * refresh tokens; every access token already issued kept working until it
 * expired, including one a thief was holding — which is the exact scenario
 * somebody clicks this button in. Bumping `tokensValidFrom` refuses all of them
 * on their next request (see auth.ts's isBeforeFloor).
 *
 * Note this ends the CURRENT device too. That is the intended reading of "sign
 * out everywhere", and the alternative — carving out the caller — would mean
 * the one session an attacker is actively using could be the one spared.
 */
export async function revokeAll(customerId: string): Promise<number> {
  const now = new Date();
  const [{ count }] = await prisma.$transaction([
    prisma.customerSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.customerUser.update({
      where: { id: customerId },
      data: { tokensValidFrom: now },
    }),
  ]);
  return count;
}

/** Revoke by refresh token — what an app's own "sign out" calls. */
export async function revokeByToken(presented: string): Promise<void> {
  const hash = hashToken(presented);
  await prisma.customerSession.updateMany({
    where: {
      OR: [{ tokenHash: hash }, { previousTokenHash: hash }],
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

export interface SessionSummary {
  id: string;
  deviceName: string | null;
  platform: string | null;
  lastUsedAt: number;
  createdAt: number;
}

/** The customer's live devices, most recently used first. */
export async function listActive(customerId: string): Promise<SessionSummary[]> {
  const rows = await prisma.customerSession.findMany({
    where: { customerId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      deviceName: true,
      platform: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    deviceName: r.deviceName,
    platform: r.platform,
    lastUsedAt: r.lastUsedAt.getTime(),
    createdAt: r.createdAt.getTime(),
  }));
}
