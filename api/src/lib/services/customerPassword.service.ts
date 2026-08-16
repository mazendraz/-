/**
 * Password registration and sign-in for CUSTOMER accounts.
 *
 * Sits alongside the provider flow in customerAuth.service — the same
 * CustomerUser rows, reached a different way. The two interact in exactly one
 * place and it is the security-critical one: an account created here is INERT
 * until its address is verified, and the provider flow claims (rather than links
 * to) an account that never got verified. Read the comment on
 * `signInWithIdentity`'s claim branch alongside this file; neither rule is safe
 * on its own.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPasswordSafe, type CustomerAuthUser } from "@/lib/auth";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/utils/errors";
import { isDerivedFromEmail } from "@/lib/validation/password";
import * as audit from "@/lib/services/audit.service";
import { sendCustomerVerificationEmail } from "@/lib/services/notifications.service";

// Long enough to survive a slow inbox and a next-morning click; short enough that
// a link found later in a forwarded thread or a shared machine is already dead.
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Hash a verification token for storage.
 *
 * sha256, not bcrypt: the input is 32 bytes of CSPRNG output, so there is no
 * guessable space for a slow hash to protect. What this buys is that a database
 * read — a backup, a log line, an injected SELECT — yields no usable link.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): { token: string; hash: string; expires: Date } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    expires: new Date(Date.now() + VERIFY_TTL_MS),
  };
}

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  emailVerified: true,
} as const;

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  /**
   * Whether the verification email actually went out.
   *
   * Was hardcoded true, which made "check your inbox" a lie whenever the mail
   * provider refused the send — and the account is unusable until that link is
   * clicked, so the customer was left waiting on something that would never
   * arrive. Found the first time a real key was configured: Resend rejects
   * every recipient except the account owner until a sending domain is
   * verified, so EVERY real customer hit that path.
   *
   * Surfacing it leaks nothing new: registration already distinguishes a taken
   * address (409), and a delivery failure in a correctly configured deployment
   * is a provider outage, not a fact about the address.
   */
  verificationSent: boolean;
}

/**
 * Create (or re-arm) a password account and send the verification email.
 *
 * Returns NO session. A newly registered account cannot sign in until the
 * address is verified, and handing back a session here would quietly undo that.
 *
 * ── Why an existing UNVERIFIED row is overwritten, not rejected ──────────────
 * If a stranger registered this address first, the row already exists with THEIR
 * password and a pending token. Refusing the real owner's registration would
 * lock them out of their own address; resending the existing token would mail
 * them a link that activates the stranger's password. Overwriting both the
 * password and the token means the link that lands in the inbox activates the
 * credentials submitted by whoever registered most recently — and only the
 * person reading that inbox can complete it.
 *
 * Once an account IS verified, this path is closed: registering over it would
 * let anyone reset a live account's password without reading any mail.
 */
export async function register(input: RegisterInput, ip?: string): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();

  // Checked here rather than in the Zod schema because the rule needs BOTH
  // fields, and the schema validates the password alone.
  if (isDerivedFromEmail(input.password, email)) {
    throw new ValidationError("Pick a password that isn't part of your email address.");
  }

  const existing = await prisma.customerUser.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, isActive: true },
  });

  if (existing?.emailVerified) {
    // Deliberately explicit. A registration form cannot hide whether an address
    // is taken — the outcome differs no matter how it is worded — so the honest
    // message is the useful one. The enumeration this permits is bounded by the
    // per-IP rate limit on the route.
    throw new ConflictError("This email already has an account. Sign in instead.");
  }

  const passwordHash = await hashPassword(input.password);
  const { token, hash, expires } = newToken();

  const customerId = existing
    ? (
        await prisma.customerUser.update({
          where: { id: existing.id },
          data: {
            name: input.name.trim(),
            passwordHash,
            emailVerifyTokenHash: hash,
            emailVerifyExpires: expires,
          },
          select: { id: true },
        })
      ).id
    : (
        await prisma.customerUser.create({
          data: {
            email,
            name: input.name.trim(),
            passwordHash,
            emailVerified: false,
            emailVerifyTokenHash: hash,
            emailVerifyExpires: expires,
          },
          select: { id: true },
        })
      ).id;

  await audit.recordAuth({
    action: "auth.customer.registered",
    email,
    userId: customerId,
    ip,
    meta: { rearmed: Boolean(existing) },
  });

  // Never throws — a mail provider outage must not leave a half-created account
  // behind an error the customer reads as "registration failed". The account IS
  // created and the link can be re-requested; only the delivery failed, and the
  // caller is told so it can say that instead of "check your inbox".
  const verificationSent = await sendCustomerVerificationEmail(
    email,
    input.name.trim(),
    token,
  );

  return { verificationSent };
}

/**
 * Complete verification and return the now-usable account.
 *
 * Looked up by the token's HASH, and the expiry is checked in the query — an
 * expired row simply doesn't match, so there is no window where a stale token
 * is found and then rejected by a second step someone could forget to write.
 */
export async function verifyEmail(token: string, ip?: string): Promise<CustomerAuthUser> {
  const row = await prisma.customerUser.findFirst({
    where: {
      emailVerifyTokenHash: hashToken(token),
      emailVerifyExpires: { gt: new Date() },
    },
    select: { ...CUSTOMER_SELECT, isActive: true },
  });

  if (!row || !row.isActive) {
    throw new UnauthorizedError("This link is invalid or has expired. Request a new one.");
  }

  const customer = await prisma.customerUser.update({
    where: { id: row.id },
    data: {
      emailVerified: true,
      // Single use. Leaving it live would make a link recovered from an inbox or
      // a proxy log replayable for the rest of its 24 hours.
      emailVerifyTokenHash: null,
      emailVerifyExpires: null,
      lastLoginAt: new Date(),
    },
    select: CUSTOMER_SELECT,
  });

  await audit.recordAuth({
    action: "auth.customer.verified",
    email: customer.email,
    userId: customer.id,
    ip,
  });

  return customer;
}

/** Distinguishes the one failure the UI must handle differently from the rest. */
export class EmailNotVerifiedError extends UnauthorizedError {
  constructor() {
    super("Confirm your email address first — check your inbox for the link.");
    this.name = "EmailNotVerifiedError";
  }
}

/**
 * Password sign-in.
 *
 * The compare runs against a possibly-null hash on purpose (verifyPasswordSafe
 * substitutes a dummy), so all four cases — no such account, a Google-only
 * account with no password, a deactivated account, and a wrong password — cost
 * the same and answer the same. Which of them happened is never inferable from
 * the response.
 */
export async function loginWithPassword(
  emailInput: string,
  password: string,
  ip?: string,
): Promise<CustomerAuthUser> {
  const email = emailInput.trim().toLowerCase();

  const row = await prisma.customerUser.findUnique({
    where: { email },
    select: { ...CUSTOMER_SELECT, passwordHash: true, isActive: true },
  });

  const usableHash = row && row.isActive ? row.passwordHash : null;
  if (!(await verifyPasswordSafe(password, usableHash))) {
    await audit.recordAuth({
      action: "auth.customer.failure",
      email,
      userId: row?.id ?? null,
      ip,
      // Recorded here, never returned: this is exactly the distinction the
      // response must not make, and exactly the one you need when reading the log.
      meta: {
        known: Boolean(row),
        hadPassword: Boolean(row?.passwordHash),
        active: row?.isActive ?? null,
      },
    });
    throw new UnauthorizedError("Incorrect email or password.");
  }

  // Only reachable with a real matching account; narrows the type.
  if (!row) throw new UnauthorizedError("Incorrect email or password.");

  // AFTER the password check, never before. Answering "verify your email" to an
  // unverified account without checking the password first would confirm that
  // the address is registered to anyone who typed it.
  if (!row.emailVerified) throw new EmailNotVerifiedError();

  const customer = await prisma.customerUser.update({
    where: { id: row.id },
    data: { lastLoginAt: new Date() },
    select: CUSTOMER_SELECT,
  });

  await audit.recordAuth({
    action: "auth.customer.success",
    email: customer.email,
    userId: customer.id,
    ip,
    meta: { method: "password" },
  });

  return customer;
}

/** Re-send the verification link for an unverified account. Never reveals whether
 *  the address exists — the caller always shows the same "check your inbox". */
export async function resendVerification(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const row = await prisma.customerUser.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerified: true, isActive: true, passwordHash: true },
  });

  // Nothing to do for a missing, verified, deactivated, or provider-only account
  // — and in every one of those cases the caller says the same thing anyway.
  if (!row || row.emailVerified || !row.isActive || !row.passwordHash) return;

  const { token, hash, expires } = newToken();
  await prisma.customerUser.update({
    where: { id: row.id },
    data: { emailVerifyTokenHash: hash, emailVerifyExpires: expires },
  });
  await sendCustomerVerificationEmail(email, row.name, token);
}
