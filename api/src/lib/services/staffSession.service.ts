/**
 * Long-lived device sessions for the Business App (staff — PROVIDER/ADMIN):
 * refresh tokens, rotation, reuse detection, and revocation.
 *
 * The access token stays a stateless JWT — fast to verify, impossible to
 * revoke on its own. This module supplies the other half: a credential that
 * CAN be revoked, so "sign out this device" means something and a stolen
 * refresh token has a short useful life instead of an indefinite one.
 *
 * Deliberately mirrors customerSession.service.ts — same rotation, same
 * grace-window retry, same reuse detection. See that module's comments for
 * the full reasoning; this one only changes the model, the table, and the TTL.
 *
 * Nothing here is used by the website. It keeps the plain httpOnly cookie
 * session exactly as before — a StaffSession is created only when a login
 * carries a `device` field, which only the mobile app ever sends.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/utils/errors";
import * as audit from "@/lib/services/audit.service";

/** How long a device stays signed in without ever opening the app.
 *  Half of CustomerSession's 60 days — see the model comment in
 *  schema.prisma for why a staff credential gets a shorter leash. */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Same sizing as customerSession.service — a dropped mobile response, not
 *  a convenience window. */
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

/** Open a new device session and return its refresh token (shown once). */
export async function issue(userId: string, device: DeviceInfo = {}): Promise<IssuedSession> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const session = await prisma.staffSession.create({
    data: {
      userId,
      tokenHash: hash,
      // Truncated, not validated — display labels from an untrusted caller.
      deviceName: device.deviceName?.slice(0, 80) || null,
      platform: device.platform?.slice(0, 16) || null,
      expiresAt,
    },
    select: { id: true },
  });

  return { refreshToken: token, sessionId: session.id, expiresAt };
}

export interface RefreshResult {
  userId: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Exchange a refresh token for a fresh one. Same three outcomes as
 * customerSession.service.refresh — current token rotates; the previous
 * token inside its grace window gets a fresh replacement (a dropped-response
 * retry); the previous token AFTER the grace window means someone else holds
 * a copy, and the session is revoked outright.
 */
export async function refresh(presented: string, ip?: string): Promise<RefreshResult> {
  const hash = hashToken(presented);

  const session = await prisma.staffSession.findFirst({
    where: { OR: [{ tokenHash: hash }, { previousTokenHash: hash }] },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      previousTokenHash: true,
      previousUsableTo: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { isActive: true } },
    },
  });

  // One message for every failure: unknown token, revoked session, expired
  // session, deactivated account — which one it was is not something an
  // unauthenticated caller should be able to learn.
  const dead =
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date() ||
    !session.user.isActive;
  if (dead) throw new UnauthorizedError("Session expired. Please sign in again.");

  const isCurrent = session.tokenHash === hash;

  if (!isCurrent) {
    const withinGrace =
      session.previousUsableTo !== null && session.previousUsableTo > new Date();

    if (!withinGrace) {
      // ── Reuse detected ──────────────────────────────────────────────────
      await prisma.staffSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await audit.recordAuth({
        action: "auth.staff.session.reuse",
        email: "-",
        userId: session.userId,
        ip,
        meta: { sessionId: session.id },
      });
      throw new UnauthorizedError("Session expired. Please sign in again.");
    }

    // Inside the grace window: hand back a usable token rather than treating
    // a retried request as a stolen one. See the docblock above.
    return rotate(session.id, session.userId, hash);
  }

  return rotate(session.id, session.userId, hash);
}

/** Issue the next token, retiring `presentedHash` into the grace slot. */
async function rotate(
  sessionId: string,
  userId: string,
  presentedHash: string,
): Promise<RefreshResult> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.staffSession.update({
    where: { id: sessionId },
    data: {
      tokenHash: hash,
      previousTokenHash: presentedHash,
      previousUsableTo: new Date(Date.now() + ROTATION_GRACE_MS),
      lastUsedAt: new Date(),
      // Each use extends the session — an app in daily use never expires,
      // one abandoned for a month does.
      expiresAt,
    },
  });

  return { userId, refreshToken: token, sessionId, expiresAt };
}

/** End one session. Idempotent, and scoped to the owner so one staff account
 *  can never revoke another's device by guessing an id. */
export async function revoke(userId: string, sessionId: string): Promise<void> {
  await prisma.staffSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * End every session for this account — "sign out everywhere".
 *
 * Moves the account-wide token floor (`User.tokensValidFrom`) as well as
 * revoking the session rows — see CustomerSession.revokeAll's comment for why
 * both halves matter: revoking sessions alone kills refresh tokens, but any
 * access token already issued (including one a departed employee's phone
 * still holds) keeps working until it expires on its own otherwise.
 */
export async function revokeAll(userId: string): Promise<number> {
  const now = new Date();
  const [{ count }] = await prisma.$transaction([
    prisma.staffSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { tokensValidFrom: now },
    }),
  ]);
  return count;
}

/** Revoke by refresh token — what the app's own "sign out" calls. */
export async function revokeByToken(presented: string): Promise<void> {
  const hash = hashToken(presented);
  await prisma.staffSession.updateMany({
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

/** The account's live devices, most recently used first. */
export async function listActive(userId: string): Promise<SessionSummary[]> {
  const rows = await prisma.staffSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
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

/** Sweep expired rows. Mirrors any equivalent job for CustomerSession, if one
 *  exists — safe to call repeatedly and cheap when there is nothing to do. */
export async function sweepExpired(): Promise<number> {
  const { count } = await prisma.staffSession.deleteMany({
    where: { expiresAt: { lte: new Date() }, revokedAt: null },
  });
  return count;
}
