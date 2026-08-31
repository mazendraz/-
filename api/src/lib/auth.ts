// Auth helpers: password hashing (bcryptjs), JWT sign/verify (jose, HS256), and
// resolving the current user from the Authorization header.
//
// The frontend stores the JWT in localStorage ("al-assema-token") and sends it as
// `Authorization: Bearer <token>` (see app/src/lib/api.ts), so login returns the
// token in the response body.
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/utils/errors";
import type { UserRole } from "@/generated/prisma/enums";
import type { ApiUser } from "@/lib/apiTypes";

// Token lifetime — override with JWT_TTL (e.g. "1h", "30m", "7d"). Defaults to a
// short "1d". The token is delivered as an httpOnly session cookie (unreadable by
// JS) and can't be revoked before expiry, so to force-revoke a session immediately
// deactivate the user (isActive=false) — getAuthUser rejects inactive users on each
// request. Keep the TTL short in production.
//
// For a CUSTOMER this is an INACTIVITY window, not a hard cap: GET /customer/me
// re-issues the cookie on every page load, so a customer who keeps visiting
// keeps their session. Shortening this therefore signs out the people who
// stopped coming, not the ones who are here — which is what it was always meant
// to do. Staff sessions have no such renewal and still expire flat.
const TOKEN_TTL = process.env.JWT_TTL ?? "1d";
const BCRYPT_ROUNDS = 12;

// Name of the STAFF httpOnly session cookie. The token is delivered as an httpOnly
// cookie (unreadable by JS, so XSS can't steal it) for the same-origin deploy; the
// Bearer header is still accepted as a transition/fallback path.
export const SESSION_COOKIE = "al-assema-session";

/**
 * Name of the CUSTOMER httpOnly session cookie.
 *
 * A SEPARATE name from the staff one, and that separation is load-bearing rather
 * than cosmetic. Both populations are signed with the same secret and both are
 * delivered as a cookie on the same origin, so while they shared one name the
 * browser could only ever hold ONE of them: signing into the admin dashboard
 * silently overwrote the customer session, and signing in as a customer
 * overwrote the dashboard's. The overwritten side then failed the audience check
 * in verifyTokenAs, came back 401, and the frontend dutifully cleared its cached
 * profile — which reads to the person sitting there as "my sign-in isn't being
 * saved". Two names means one browser can legitimately hold both.
 */
export const CUSTOMER_SESSION_COOKIE = "al-assema-customer-session";

/** Parse a TTL ("1d", "12h", "30m", "45s", or bare seconds) → seconds. */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 24 * 60 * 60; // fallback: 1 day
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  const mult = unit === "d" ? 86400 : unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return n * mult;
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
}

/**
 * Attributes for the session cookie. httpOnly (no JS access) + SameSite=Strict
 * (not sent on cross-site requests → structural CSRF protection for the same-origin
 * deploy) + Secure in production (HTTPS only; omitted in dev so it works over http
 * localhost). maxAge tracks JWT_TTL so the cookie and token expire together.
 */
export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ttlToSeconds(TOKEN_TTL),
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  // Business Control Center (desktop app) permission grants — see
  // withPermission.ts. Always an array (possibly empty); a PROVIDER never has
  // any set in practice, but desktopOnly() also checks role, not just this.
  desktopPermissions: string[];
}

/**
 * The signed-in CUSTOMER. Intentionally has no `role`, no `companyId` and no
 * `desktopPermissions` — there is nothing for a staff guard to read off it, so a
 * customer can't be passed to one by accident and quietly satisfy it.
 */
export interface CustomerAuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

// ── Passwords ─────────────────────────────────────────────────────────────────

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real bcrypt hash of a throwaway string, computed once at boot. Used to run a
// compare even when the account doesn't exist, so a login response takes the same
// time whether or not the email is registered — closing the timing side-channel an
// attacker could use to enumerate valid accounts.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", BCRYPT_ROUNDS);

/**
 * Verify a password against a possibly-null hash (null = no such/active user).
 * ALWAYS performs one bcrypt compare — against DUMMY_HASH when the hash is null —
 * so timing doesn't reveal whether the account exists. Returns false for a null
 * hash regardless of the compare result.
 */
export async function verifyPasswordSafe(
  plain: string,
  hash: string | null,
): Promise<boolean> {
  const match = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash !== null && match;
}

// ── JWT ───────────────────────────────────────────────────────────────────────

// Minimum secret length for HS256. A short/guessable secret is offline-
// bruteforceable from any single captured token, which would let an attacker mint
// an ADMIN token for any user id — so we refuse a weak secret in production. 32
// chars matches the documented `openssl rand -base64 32` recommendation.
const MIN_JWT_SECRET_LENGTH = 32;

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  if (
    process.env.NODE_ENV === "production" &&
    secret.length < MIN_JWT_SECRET_LENGTH
  ) {
    throw new Error(
      `JWT_SECRET is too short for production (need ≥${MIN_JWT_SECRET_LENGTH} chars). ` +
        `Generate a strong one with: openssl rand -base64 32`,
    );
  }
  return new TextEncoder().encode(secret);
}

// ── Token audience: staff vs. customer ───────────────────────────────────────
// Two populations now hold tokens signed with the SAME secret: staff (`User` —
// admin/provider, password login) and customers (`CustomerUser` — Google/Apple,
// no password). A token minted for one must never authorize the other.
//
// Today the tables alone would mostly stop it — getAuthUser looks the subject up
// in `User`, and a CustomerUser's uuid won't be found there. But "these two uuid
// spaces happen not to overlap" is an accident of how the lookup is written, not
// a rule anyone can see. The day someone adds a route that resolves a subject
// differently, or the two id spaces stop being disjoint, the boundary is gone
// with nothing failing loudly.
//
// So the audience is written into the token and checked on the way back in.
export type TokenAudience = "staff" | "customer";

export interface TokenClaims {
  sub: string; // user id
  role: UserRole;
  companyId: string | null;
  /**
   * The StaffSession this token was minted for, when there is one.
   *
   * Present on tokens issued to the Business App mobile client (which sends
   * `device` and gets a refresh token); absent for the website, which has no
   * session row — its credential is the httpOnly cookie and its revocation
   * story is the account floor (`tokensValidFrom`), not a per-device row.
   * Mirrors CustomerTokenClaims.sid exactly — see that field's comment for
   * why this is what makes revoking one device mean something.
   */
  sid?: string;
  /** Seconds since epoch, from the token's own `iat`. Absent on a token minted
   *  before that claim was read here — treated as "no issue time known". */
  issuedAt?: number;
}

export interface CustomerTokenClaims {
  sub: string; // CustomerUser id
  /**
   * The CustomerSession this token was minted for, when there is one.
   *
   * Present on tokens issued to a MOBILE client (which sends `device` and gets a
   * refresh token); absent for the website, which has no session row — its
   * credential is the httpOnly cookie and its revocation story is the account
   * floor (`tokensValidFrom`), not a per-device row.
   *
   * This is what makes revoking ONE device mean something. Without it, "sign out
   * this phone" killed the refresh token and left the access token working until
   * it expired, which is the whole of H-01's second half.
   */
  sid?: string;
  /** Seconds since epoch, from the token's own `iat`. */
  issuedAt?: number;
}

export function signToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({
    typ: "staff",
    role: claims.role,
    companyId: claims.companyId,
    ...(claims.sid ? { sid: claims.sid } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

/**
 * Mint a CUSTOMER session token. Carries no role and no companyId — a customer
 * has neither, and omitting them means a customer token cannot even express the
 * claims a staff guard reads.
 *
 * `sid` is included when the caller has a device session to bind to (see
 * CustomerTokenClaims.sid). Omitting it is not a weaker token — it is the
 * website's normal shape — but a token that HAS one dies the moment that
 * session is revoked.
 */
export function signCustomerToken(claims: CustomerTokenClaims): Promise<string> {
  return new SignJWT({ typ: "customer", ...(claims.sid ? { sid: claims.sid } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

/**
 * Verify signature + expiry, then assert the token was minted for `expected`.
 *
 * A token with no `typ` at all is treated as "staff": every token issued before
 * this claim existed is a staff token, and rejecting them would 401 every signed-
 * in admin and provider the moment this deploys. The fallback is safe in the only
 * direction that matters — customer tokens are ALWAYS minted with typ:"customer",
 * so nothing can reach the customer side by omitting the claim. It can be deleted
 * once JWT_TTL has elapsed after the deploy that introduced it.
 */
async function verifyTokenAs(token: string, expected: TokenAudience) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
  const audience = (payload.typ as TokenAudience | undefined) ?? "staff";
  if (audience !== expected) {
    // Deliberately the same message as a bad signature: which audience a token
    // belongs to is not something an unauthenticated caller should learn.
    throw new UnauthorizedError("Invalid or expired token");
  }
  return payload;
}

async function verifyToken(token: string): Promise<TokenClaims> {
  const payload = await verifyTokenAs(token, "staff");
  return {
    sub: String(payload.sub),
    role: payload.role as UserRole,
    companyId: (payload.companyId as string | null) ?? null,
    sid: typeof payload.sid === "string" ? payload.sid : undefined,
    issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
  };
}

async function verifyCustomerToken(token: string): Promise<CustomerTokenClaims> {
  const payload = await verifyTokenAs(token, "customer");
  return {
    sub: String(payload.sub),
    sid: typeof payload.sid === "string" ? payload.sid : undefined,
    issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
  };
}

/**
 * Was this token minted before the account's revocation floor?
 *
 * `iat` is in SECONDS and the floor is a millisecond timestamp, so the floor is
 * truncated the same way before comparing. A token issued in the very same
 * second the floor was set is ACCEPTED — the alternative is signing someone out
 * of the session they just created by resetting their own password, which is
 * exactly the flow that sets the floor. Nothing is lost: the tokens this exists
 * to kill were issued long before, not within the same second.
 *
 * A token with no `iat` at all cannot be placed relative to the floor. Those are
 * refused once a floor exists — an unplaceable token is precisely what a forged
 * or hand-edited one looks like, and every token this codebase mints has one.
 */
function isBeforeFloor(
  issuedAt: number | undefined,
  // `undefined` as well as `null`, and the difference matters: null is the
  // column's own "no floor set", while undefined is a caller that did not
  // select the column at all. Both mean "nothing to compare against" — and
  // conflating them with a set floor would throw on a missing field rather
  // than fail closed OR open in any useful way.
  floor: Date | null | undefined,
): boolean {
  if (floor == null) return false;
  if (issuedAt === undefined) return true;
  return issuedAt < Math.floor(floor.getTime() / 1000);
}

// ── Current user ──────────────────────────────────────────────────────────────

/**
 * Every JWT this request could be authenticating with, in priority order: the
 * Authorization: Bearer header (transition/API clients and both mobile apps)
 * first, then each named cookie.
 *
 * A LIST rather than a single value because the customer side accepts two cookie
 * names — its own, and the shared one it used to live in (see
 * CUSTOMER_SESSION_COOKIE). Trying them in turn is what lets a customer who was
 * already signed in when this deployed stay signed in.
 */
function resolveTokens(request: NextRequest, cookieNames: string[]): string[] {
  const tokens: string[] = [];

  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) tokens.push(token);

  for (const name of cookieNames) {
    const cookie = request.cookies.get(name)?.value;
    if (cookie) tokens.push(cookie);
  }

  if (tokens.length === 0) throw new UnauthorizedError("Authentication required");
  return tokens;
}

/**
 * Verify the first candidate that checks out for `expected`.
 *
 * A candidate that fails is skipped, not fatal: the legacy shared cookie may
 * well hold the OTHER population's token, and that must read as "no customer
 * session here", not as an error that hides a perfectly good one further down
 * the list. If none verify, the last failure is what surfaces.
 */
async function verifyFirst<T>(
  tokens: string[],
  verify: (token: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown = new UnauthorizedError("Authentication required");
  for (const token of tokens) {
    try {
      return await verify(token);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Is this a CUSTOMER token? Used by the logout paths to decide whether the
 * legacy shared cookie belongs to the customer being signed out — clearing it
 * unconditionally would sign out a staff session in the same browser.
 */
export async function isCustomerToken(token: string): Promise<boolean> {
  try {
    await verifyTokenAs(token, "customer");
    return true;
  } catch {
    return false;
  }
}

/** Verify the token (header or cookie) and load the (active) user. Throws 401 otherwise. */
export async function getAuthUser(request: NextRequest): Promise<AuthUser> {
  const claims = await verifyFirst(resolveTokens(request, [SESSION_COOKIE]), verifyToken);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      isActive: true,
      desktopPermissions: true,
      tokensValidFrom: true,
    },
  });
  if (!user || !user.isActive) {
    throw new UnauthorizedError("Account is inactive or no longer exists");
  }
  // A password change, an admin-set password, or a role change moves the floor;
  // every token minted before it stops working here, on the next request. Same
  // message as an inactive account — which of the two it was is not something
  // the holder of a dead token needs to learn.
  if (isBeforeFloor(claims.issuedAt, user.tokensValidFrom)) {
    throw new UnauthorizedError("Account is inactive or no longer exists");
  }

  // ── Per-device: was THIS session revoked? ──────────────────────────────────
  // Only for a token that names one — mirrors getCustomerUser's identical
  // block exactly. A website token has no `sid` and is governed by the floor
  // above; a Business App mobile token has one, which is what lets "sign out
  // this device" end a single lost phone without ending every other session
  // or the web dashboard.
  if (claims.sid) {
    const session = await prisma.staffSession.findUnique({
      where: { id: claims.sid },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });
    const dead =
      !session ||
      session.userId !== user.id ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date();
    if (dead) throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    desktopPermissions: user.desktopPermissions,
  };
}

/**
 * Verify a CUSTOMER token (header or cookie) and load the active CustomerUser.
 *
 * Mirrors getAuthUser deliberately, including the re-read on every request: that
 * is what makes `isActive = false` an immediate kill-switch rather than something
 * that waits out the token's expiry.
 */
export async function getCustomerUser(request: NextRequest): Promise<CustomerAuthUser> {
  const claims = await verifyFirst(
    // The legacy shared cookie is still accepted so sessions opened before the
    // two names were split survive the deploy; it can be dropped from this list
    // once JWT_TTL has elapsed after that deploy.
    resolveTokens(request, [CUSTOMER_SESSION_COOKIE, SESSION_COOKIE]),
    verifyCustomerToken,
  );

  const customer = await prisma.customerUser.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      emailVerified: true,
      isActive: true,
      tokensValidFrom: true,
    },
  });
  if (!customer || !customer.isActive) {
    throw new UnauthorizedError("Account is inactive or no longer exists");
  }

  // ── Account-wide floor: "sign out everywhere", password reset ──────────────
  if (isBeforeFloor(claims.issuedAt, customer.tokensValidFrom)) {
    throw new UnauthorizedError("Account is inactive or no longer exists");
  }

  // ── Per-device: was THIS session revoked? ──────────────────────────────────
  // Only for a token that names one. A website token has no `sid` and is
  // governed by the floor above; a mobile token has one, which is what lets a
  // customer end a single lost phone without ending every other device.
  //
  // One extra indexed lookup on a primary key, and only for tokens that carry
  // the claim. The alternative — waiting out JWT_TTL — is what made "sign out
  // this device" cosmetic.
  if (claims.sid) {
    const session = await prisma.customerSession.findUnique({
      where: { id: claims.sid },
      select: { customerId: true, revokedAt: true, expiresAt: true },
    });
    const dead =
      !session ||
      session.customerId !== customer.id ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date();
    if (dead) throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    avatarUrl: customer.avatarUrl,
    emailVerified: customer.emailVerified,
  };
}

export function toApiUser(user: AuthUser): ApiUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    desktopPermissions: user.desktopPermissions,
  };
}
