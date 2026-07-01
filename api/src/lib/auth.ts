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
// short "1d" (matches .env.example/DEPLOY): tokens live in localStorage and can't
// be revoked before expiry, so to force-revoke a session immediately deactivate
// the user (isActive=false) — getAuthUser rejects inactive users on each request.
const TOKEN_TTL = process.env.JWT_TTL ?? "1d";
const BCRYPT_ROUNDS = 12;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string | null;
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

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface TokenClaims {
  sub: string; // user id
  role: UserRole;
  companyId: string | null;
}

export function signToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, companyId: claims.companyId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

async function verifyToken(token: string): Promise<TokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      sub: String(payload.sub),
      role: payload.role as UserRole,
      companyId: (payload.companyId as string | null) ?? null,
    };
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

// ── Current user ──────────────────────────────────────────────────────────────

function bearerToken(request: NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedError("Authentication required");
  }
  return token;
}

/** Verify the Bearer token and load the (active) user. Throws 401 otherwise. */
export async function getAuthUser(request: NextRequest): Promise<AuthUser> {
  const claims = await verifyToken(bearerToken(request));

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, role: true, companyId: true, isActive: true },
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
  };
}

export function toApiUser(user: AuthUser): ApiUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  };
}
