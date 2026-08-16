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
const TOKEN_TTL = process.env.JWT_TTL ?? "1d";
const BCRYPT_ROUNDS = 12;

// Name of the httpOnly session cookie. The token is delivered as an httpOnly cookie
// (unreadable by JS, so XSS can't steal it) for the same-origin deploy; the Bearer
// header is still accepted as a transition/fallback path.
export const SESSION_COOKIE = "al-assema-session";

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
}

export interface CustomerTokenClaims {
  sub: string; // CustomerUser id
}

export function signToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({ typ: "staff", role: claims.role, companyId: claims.companyId })
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
 */
export function signCustomerToken(claims: CustomerTokenClaims): Promise<string> {
  return new SignJWT({ typ: "customer" })
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
  };
}

async function verifyCustomerToken(token: string): Promise<CustomerTokenClaims> {
  const payload = await verifyTokenAs(token, "customer");
  return { sub: String(payload.sub) };
}

// ── Current user ──────────────────────────────────────────────────────────────

// Resolve the JWT from either the Authorization: Bearer header (transition/API
// clients) OR the httpOnly session cookie (same-origin browser auth). Header wins
// when both are present.
function resolveToken(request: NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token;

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;

  throw new UnauthorizedError("Authentication required");
}

/** Verify the token (header or cookie) and load the (active) user. Throws 401 otherwise. */
export async function getAuthUser(request: NextRequest): Promise<AuthUser> {
  const claims = await verifyToken(resolveToken(request));

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
    },
  });
  if (!user || !user.isActive) {
    throw new UnauthorizedError("Account is inactive or no longer exists");
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
  const claims = await verifyCustomerToken(resolveToken(request));

  const customer = await prisma.customerUser.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      emailVerified: true,
      isActive: true,
    },
  });
  if (!customer || !customer.isActive) {
    throw new UnauthorizedError("Account is inactive or no longer exists");
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
