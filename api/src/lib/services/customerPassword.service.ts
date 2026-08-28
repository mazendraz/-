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
import * as sessions from "@/lib/services/customerSession.service";
import {
  sendCustomerVerificationEmail,
  sendCustomerPasswordResetEmail,
  sendCustomerWelcomeEmail,
} from "@/lib/services/notifications.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";

// Long enough to survive a slow inbox and a next-morning click; short enough that
// a link found later in a forwarded thread or a shared machine is already dead.
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

// Shorter than verification: a reset link is a stronger credential — its
// holder gets to overwrite the password outright, not just prove inbox
// control — so it deserves a tighter window. One hour is generous enough to
// survive a slow inbox check without staying live long enough to be a
// realistic target from a shared machine's browser history.
const RESET_TTL_MS = 60 * 60 * 1000;

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

function newToken(ttlMs: number): { token: string; hash: string; expires: Date } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    expires: new Date(Date.now() + ttlMs),
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
  const { token, hash, expires } = newToken(VERIFY_TTL_MS);

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

  // The account only becomes usable NOW (see the module comment — a
  // password account is inert until this call), so this is the one moment
  // a welcome email means "your account is ready", not "click a link to
  // finish setting up". Deferred past the response, like every other
  // notification send in this codebase.
  runAfterResponse(() => sendCustomerWelcomeEmail(customer.email, customer.name));

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

/**
 * Re-send the verification link for an unverified account.
 *
 * `"skipped"` covers every address there is nothing to send to (missing,
 * already verified, deactivated, provider-only) and is deliberately
 * INDISTINGUISHABLE from success at the route — that non-disclosure is the
 * whole point of this endpoint (see its own comment).
 *
 * `"failed"` is different in kind: the address WAS real and pending, and the
 * mail transport itself refused. That case used to be swallowed here, so the
 * route answered `{sent:true}` and the UI told the customer to go check an
 * inbox nothing would ever arrive in — with a "resend" button that would keep
 * claiming success forever. `register()` above has always reported this
 * honestly (`verificationSent`); this path simply never got the same contract.
 *
 * ── The tradeoff, stated plainly ────────────────────────────────────────────
 * While mail is BROKEN, "failed" vs "skipped" does distinguish a real pending
 * account from an unknown address. That is a real (small) enumeration signal,
 * and it is accepted here for two reasons: registration already discloses the
 * same fact outright (409 vs 201, same 5/hour cap), and the alternative is a
 * permanently lying UI that leaves customers with no way to tell a slow inbox
 * from a dead one. When mail is healthy — the normal case — every address
 * still gets the identical answer.
 */
export type ResendOutcome = "sent" | "skipped" | "failed";

export async function resendVerification(emailInput: string): Promise<ResendOutcome> {
  const email = emailInput.trim().toLowerCase();
  const row = await prisma.customerUser.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerified: true, isActive: true, passwordHash: true },
  });

  if (!row || row.emailVerified || !row.isActive || !row.passwordHash) return "skipped";

  const { token, hash, expires } = newToken(VERIFY_TTL_MS);
  await prisma.customerUser.update({
    where: { id: row.id },
    data: { emailVerifyTokenHash: hash, emailVerifyExpires: expires },
  });
  return (await sendCustomerVerificationEmail(email, row.name, token)) ? "sent" : "failed";
}

// ── Forgot password ──────────────────────────────────────────────────────────

/**
 * Start a password reset: issue a token and email the link. Never reveals
 * whether the address exists, is Google-only, or deactivated — same
 * non-disclosure rule as resendVerification above, and for the same reason
 * (a "forgot password" form is the classic account-enumeration surface).
 *
 * A Google-only account (passwordHash null) gets no token: there is no
 * password on that row to reset, and issuing one anyway would let a reset
 * link silently CREATE a password on an account that never had one — a way
 * to add a second, weaker way into an account that chose to only accept one.
 */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const row = await prisma.customerUser.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true, passwordHash: true },
  });

  if (!row || !row.isActive || !row.passwordHash) return;

  const { token, hash, expires } = newToken(RESET_TTL_MS);
  await prisma.customerUser.update({
    where: { id: row.id },
    data: { passwordResetTokenHash: hash, passwordResetExpires: expires },
  });
  await sendCustomerPasswordResetEmail(email, row.name, token);
}

/**
 * Complete a password reset and sign the customer in — same reasoning as
 * verifyEmail's own sign-in-on-success: the link came from the inbox they're
 * proving they control, which is exactly the evidence a login would ask for.
 *
 * Looked up by the token's HASH with the expiry checked in the query, same
 * pattern as verifyEmail — an expired row simply doesn't match.
 *
 * Every OTHER session on the account is revoked (see revokeAll below). A
 * password reset is the customer telling the system "assume this account may
 * have been compromised" (they either forgot the password themselves, or
 * someone else changed it and they're taking it back) — either way, a device
 * or refresh token that was already signed in under the OLD password must not
 * keep riding it past this point.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  ip?: string,
): Promise<CustomerAuthUser> {
  const row = await prisma.customerUser.findFirst({
    where: {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpires: { gt: new Date() },
    },
    select: { ...CUSTOMER_SELECT, isActive: true },
  });

  if (!row || !row.isActive) {
    throw new UnauthorizedError("This link is invalid or has expired. Request a new one.");
  }

  if (isDerivedFromEmail(newPassword, row.email)) {
    throw new ValidationError("Pick a password that isn't part of your email address.");
  }

  const passwordHash = await hashPassword(newPassword);
  const customer = await prisma.customerUser.update({
    where: { id: row.id },
    data: {
      passwordHash,
      // Single use — the same reasoning as emailVerifyTokenHash being cleared
      // on verification: a link recovered from an inbox or a proxy log stays
      // dead after its first use, not live for the rest of its hour.
      passwordResetTokenHash: null,
      passwordResetExpires: null,
    },
    select: CUSTOMER_SELECT,
  });

  await sessions.revokeAll(customer.id);

  await audit.recordAuth({
    action: "auth.customer.password_reset",
    email: customer.email,
    userId: customer.id,
    ip,
  });

  return customer;
}
