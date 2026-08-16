/**
 * Turning a VERIFIED provider identity into a CustomerUser session.
 *
 * The verification already happened (googleIdentity.service) — by the time
 * anything here runs, the subject/email/emailVerified are facts asserted by
 * Google, not claims from the caller. What is left is the account decision:
 * which existing account is this, or is it a new one.
 */
import type { IdentityProvider } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/utils/errors";
import type { CustomerAuthUser } from "@/lib/auth";
import * as audit from "@/lib/services/audit.service";

/** A provider-verified identity, shaped the same whoever verified it. */
export interface VerifiedIdentity {
  provider: IdentityProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

export interface SignInResult {
  customer: CustomerAuthUser;
  /** "created" | "linked" | "returning" — for the audit trail and the response. */
  outcome: "created" | "linked" | "returning";
}

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  emailVerified: true,
  isActive: true,
} as const;

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  isActive: boolean;
};

function toAuthUser(row: CustomerRow): CustomerAuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    emailVerified: row.emailVerified,
  };
}

function assertActive(row: CustomerRow): void {
  if (!row.isActive) {
    // Same wording a customer would see for any other failed sign-in. Telling a
    // caller "this account exists but is disabled" is free intelligence.
    throw new UnauthorizedError("Sign-in failed. Please try again.");
  }
}

/**
 * Resolve a verified identity to a session, creating or linking as needed.
 *
 * Three paths, in the order they're tried:
 *
 *  1. **Known identity** — (provider, subject) already on file. The ordinary
 *     returning sign-in. Looked up by SUBJECT, never by email, so a customer who
 *     changes their Google address still lands on their own account.
 *
 *  2. **Known email, new provider** — an account exists with this address and the
 *     provider says the address is verified. Link the new identity to it. This is
 *     what stops the same person from ending up with one account per phone they
 *     own.
 *
 *  3. **Unknown** — create the account.
 *
 * ── The refusal in the middle ────────────────────────────────────────────────
 * If an account exists on that email and the provider does NOT vouch for it,
 * sign-in is refused outright. Linking would hand over an existing account —
 * with its requests and its conversations — to whoever managed to assert an
 * address they don't control. Creating a parallel account instead isn't an
 * option either: the address is unique, so there is nowhere to put it. Refusing
 * is the only answer that neither takes over an account nor silently splits one,
 * and it is recorded (`auth.customer.blocked`) because a burst of these is
 * someone probing, not a customer having a bad day.
 */
export async function signInWithIdentity(
  identity: VerifiedIdentity,
  ip?: string,
): Promise<SignInResult> {
  const { provider, subject, email } = identity;

  // ── 1. Known identity ──────────────────────────────────────────────────────
  const existingIdentity = await prisma.customerIdentity.findUnique({
    where: { provider_subject: { provider, subject } },
    select: { customer: { select: CUSTOMER_SELECT } },
  });

  if (existingIdentity) {
    assertActive(existingIdentity.customer);
    const customer = await refreshProfile(existingIdentity.customer.id, identity);
    await audit.recordAuth({
      action: "auth.customer.success",
      email,
      userId: customer.id,
      ip,
      meta: { provider, outcome: "returning" },
    });
    return { customer: toAuthUser(customer), outcome: "returning" };
  }

  // ── 2. Known email, new provider ───────────────────────────────────────────
  const byEmail = await prisma.customerUser.findUnique({
    where: { email },
    select: CUSTOMER_SELECT,
  });

  if (byEmail) {
    if (!identity.emailVerified) {
      await audit.recordAuth({
        action: "auth.customer.blocked",
        email,
        userId: byEmail.id,
        ip,
        meta: { provider, reason: "unverified_email_on_existing_account" },
      });
      throw new UnauthorizedError("Sign-in failed. Please try again.");
    }
    assertActive(byEmail);

    // ── Claiming an UNVERIFIED account ──────────────────────────────────────
    // The account exists but nobody ever proved they own the address. Linking to
    // it as-is is the account-takeover path that email verification exists to
    // close, and it stays open here if this branch just links:
    //
    //   Anyone can register victim@gmail.com with a password of their choosing.
    //   The row now exists, unverified. When the real owner signs in with Google
    //   — which DOES prove ownership — a plain link would hand them an account
    //   whose password a stranger already knows.
    //
    // Google's proof outranks an unproven password, so the account is claimed
    // rather than shared: mark it verified, and DROP the password along with any
    // pending verification token. Whoever set that password never demonstrated
    // any claim to this address.
    //
    // Cost when there was no attacker — someone registered, never clicked the
    // link, then signed in with Google instead — is that their unused password
    // stops working. They keep the account and everything in it, and can set a
    // password again later. That is the right trade against the alternative.
    const wasUnverified = !byEmail.emailVerified;

    await prisma.$transaction(async (tx) => {
      await tx.customerIdentity.create({
        data: { customerId: byEmail.id, provider, subject },
      });
      if (wasUnverified) {
        await tx.customerUser.update({
          where: { id: byEmail.id },
          data: {
            passwordHash: null,
            emailVerifyTokenHash: null,
            emailVerifyExpires: null,
          },
        });
      }
    });

    const customer = await refreshProfile(byEmail.id, identity);
    await audit.recordAuth({
      action: "auth.customer.linked",
      email,
      userId: customer.id,
      ip,
      // `claimed` marks the case above. A run of these is worth looking at: it
      // means someone is planting accounts on addresses they don't own.
      meta: { provider, claimed: wasUnverified },
    });
    return { customer: toAuthUser(customer), outcome: "linked" };
  }

  // ── 3. New account ─────────────────────────────────────────────────────────
  // One transaction: an account with no way to sign in to it is not a state
  // worth being able to reach.
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.customerUser.create({
        data: {
          email,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
          emailVerified: identity.emailVerified,
          lastLoginAt: new Date(),
        },
        select: CUSTOMER_SELECT,
      });
      await tx.customerIdentity.create({
        data: { customerId: row.id, provider, subject },
      });
      return row;
    });

    await audit.recordAuth({
      action: "auth.customer.created",
      email,
      userId: created.id,
      ip,
      meta: { provider },
    });
    return { customer: toAuthUser(created), outcome: "created" };
  } catch (err) {
    // Two devices signing in for the very first time at the same moment both
    // reach step 3 and one loses the unique index. That is a race, not a
    // failure — the account it wanted now exists, so read it and continue.
    // Retried ONCE: a second collision would mean something other than a race.
    if (!isUniqueViolation(err)) throw err;

    const raced = await prisma.customerIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      select: { customer: { select: CUSTOMER_SELECT } },
    });
    if (!raced) throw err;

    assertActive(raced.customer);
    await audit.recordAuth({
      action: "auth.customer.success",
      email,
      userId: raced.customer.id,
      ip,
      meta: { provider, outcome: "returning", raced: true },
    });
    return { customer: toAuthUser(raced.customer), outcome: "returning" };
  }
}

/**
 * Keep the cached profile in step with the provider and stamp the sign-in.
 *
 * `emailVerified` is deliberately allowed to move in BOTH directions — it is a
 * live assertion by the provider, and pinning it true once would leave the
 * linking rule in signInWithIdentity trusting a fact that has since expired.
 */
async function refreshProfile(
  customerId: string,
  identity: VerifiedIdentity,
): Promise<CustomerRow> {
  return prisma.customerUser.update({
    where: { id: customerId },
    data: {
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      emailVerified: identity.emailVerified,
      lastLoginAt: new Date(),
    },
    select: CUSTOMER_SELECT,
  });
}

/** Prisma's unique-constraint failure (P2002), without importing the error class. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
