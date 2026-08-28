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
import { sendCustomerWelcomeEmail } from "@/lib/services/notifications.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";
import { seal } from "@/lib/utils/secretBox";

/** A provider-verified identity, shaped the same whoever verified it. */
export interface VerifiedIdentity {
  provider: IdentityProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  /**
   * What the provider asserts about the profile, or null when it asserts
   * NOTHING. That distinction is load-bearing rather than cosmetic: Google sends
   * both on every sign-in, Apple sends neither — a name reaches the client once,
   * on the first authorization, and never again. Writing a null straight through
   * would blank a real name and avatar on the customer's SECOND Apple sign-in.
   * See refreshProfile for the half of this that does the work.
   */
  name: string | null;
  avatarUrl: string | null;
  /**
   * A name to use ONLY when this sign-in creates a brand-new row, where the
   * non-null column has to be given something. Never written over an existing
   * profile, which is what separates it from `name` above.
   *
   * It exists for Apple. A customer who authorized the app once, deleted their
   * account here, then came back arrives with no name at all — and for a
   * Hide-My-Email address the obvious fallback, the email's local part, is random
   * hex. The Apple route resolves something readable instead and passes it here.
   */
  fallbackName?: string;
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
          // CustomerUser.name is non-null, so a provider that asserts no name
          // still needs one to create a row. The Apple route resolves a real
          // display name before it reaches here (appleDisplayName), so this is a
          // backstop rather than the path any live sign-in takes.
          name: identity.name ?? identity.fallbackName ?? email.split("@")[0]!,
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
    // Unlike the password path, there is no separate activation step here —
    // the provider already asserted the identity, so the account is usable
    // the moment this row exists. Same welcome email, same deferred send.
    runAfterResponse(() => sendCustomerWelcomeEmail(created.email, created.name));
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
      // Only the fields the provider actually asserted. A null means "no
      // assertion", so it leaves the stored value alone instead of clearing it —
      // the entire reason those fields are nullable.
      //
      // The cost: a Google user who removes their profile photo keeps the stale
      // cached URL until some later sign-in carries a new one. That is a far
      // smaller wrong than blanking a returning Apple user's name on every
      // single sign-in, which is what the unconditional write did.
      ...(identity.name !== null && { name: identity.name }),
      ...(identity.avatarUrl !== null && { avatarUrl: identity.avatarUrl }),
      emailVerified: identity.emailVerified,
      lastLoginAt: new Date(),
    },
    select: CUSTOMER_SELECT,
  });
}

/**
 * Park an Apple refresh token against an identity row, encrypted.
 *
 * Called after a successful Apple sign-in, on a best-effort basis — see the
 * route. Never throws: the customer is already signed in by the time this runs,
 * and losing the ability to revoke later is not worth turning a working sign-in
 * into an error.
 *
 * ── Why it only ever writes a non-empty value ────────────────────────────────
 * Apple issues an authorization code on every sign-in, but the exchange can fail
 * (expired code, network, a deploy with no private key). Writing the null result
 * of a failed exchange would ERASE a perfectly good token captured on an earlier
 * sign-in, trading a working revocation for a broken one. So a failure leaves
 * the column alone, and any later successful sign-in replaces it.
 *
 * ── Why it is keyed on (provider, subject) ───────────────────────────────────
 * The same unique key sign-in itself uses. Keying on customerId would be wrong
 * for an account with both a Google and an Apple identity — there are two rows,
 * and only the Apple one has a token Apple will accept.
 */
export async function storeAppleRefreshToken(
  subject: string,
  refreshToken: string | null,
): Promise<void> {
  if (!refreshToken) return;

  const sealed = seal(refreshToken);
  // Null when APPLE_TOKEN_ENCRYPTION_KEY is unset. Storing the plaintext as a
  // fallback would quietly defeat the reason the column is encrypted at all.
  if (!sealed) return;

  try {
    await prisma.customerIdentity.update({
      where: { provider_subject: { provider: "APPLE", subject } },
      data: { refreshTokenEnc: sealed },
    });
  } catch (err) {
    console.warn(
      `[apple] could not store refresh token: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
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
