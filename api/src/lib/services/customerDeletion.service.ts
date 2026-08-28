/**
 * Deleting a customer account.
 *
 * Apple requires any app that lets you CREATE an account to let you delete it
 * from inside the app (guideline 5.1.1(v)) — not a support email, not a form
 * that opens a ticket. This is that, and the website gets it too.
 *
 * ── What is deleted, and what deliberately is not ────────────────────────────
 * Deleted: the login identity and everything scoped to it — the CustomerUser
 * row, its Google/Apple links, and every device session. After this the person
 * cannot sign in, and nothing about them can be signed in to.
 *
 * KEPT: the requests they submitted. Those are not the customer's account data,
 * they are the PROVIDER's record of work — a request that was quoted, carried
 * out, completed and in some cases invoiced, with financial rows hanging off it
 * (LeadCompletion, Transaction). A provider cannot lose their books because a
 * customer removed a login that was added to the product years later. Every one
 * of those requests predates accounts existing at all.
 *
 * So `Lead.customerId` is nulled (the schema's onDelete: SetNull does it) and
 * the request reverts to exactly what it was before accounts: a record owned by
 * the company it was sent to. The UI says this in plain words before the button
 * is pressed — an "everything will be erased" promise we then don't keep would
 * be worse than the honest version.
 *
 * ── The second half of 5.1.1(v), which is easy to miss ───────────────────────
 * Deleting our rows is not the whole obligation for a customer who signed in
 * with Apple. Apple separately requires the app to call its revocation endpoint,
 * so the account stops appearing under Settings → Apple ID → Sign in with Apple.
 * Without that call the user is left with an entry for an account that no longer
 * exists and no way to detach it — and it is a documented rejection reason.
 *
 * deleteAccount below does that, in the order the ordering note explains: the
 * local delete is what the customer asked for, and it is never made conditional
 * on Apple answering.
 */
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/utils/errors";
import * as audit from "@/lib/services/audit.service";
import {
  isAppleServerAuthConfigured,
  primaryAppleClientId,
  revokeAppleRefreshToken,
} from "@/lib/services/appleServerAuth.service";
import { open } from "@/lib/utils/secretBox";
import { runAfterResponse } from "@/lib/utils/afterResponse";

export interface DeletionSummary {
  /** Requests whose account link was severed — they remain with their company. */
  leadsDetached: number;
  sessionsRevoked: number;
  /**
   * Whether an Apple revocation was scheduled. False covers every ordinary
   * reason there was nothing to revoke — a Google-only account, a sign-in that
   * predates the token column, an unconfigured deploy — so it is a fact for the
   * audit trail, not a failure signal.
   */
  appleRevocationScheduled: boolean;
}

/**
 * Delete the account. Irreversible.
 *
 * The audit entry is written BEFORE the delete, while the email is still
 * readable — afterwards there is nothing left to look it up from, and an
 * account deletion with no record of whose it was is the one event you most
 * want to be able to answer questions about later. AuditLog.actorId is a plain
 * string with no foreign key, so the row survives the account it names.
 */
export async function deleteAccount(
  customerId: string,
  ip?: string,
): Promise<DeletionSummary> {
  const customer = await prisma.customerUser.findUnique({
    where: { id: customerId },
    select: { id: true, email: true },
  });
  if (!customer) throw new NotFoundError("Account");

  const [leadsDetached, sessionsRevoked, appleToken] = await Promise.all([
    prisma.lead.count({ where: { customerId } }),
    prisma.customerSession.count({ where: { customerId, revokedAt: null } }),
    // Read BEFORE the delete — CustomerIdentity cascades, so a moment from now
    // there is nothing left to read it from.
    appleRefreshTokenFor(customerId),
  ]);

  await audit.recordAuth({
    action: "auth.customer.deleted",
    email: customer.email,
    userId: customer.id,
    ip,
    meta: { leadsDetached, sessionsRevoked, appleRevocation: Boolean(appleToken) },
  });

  // One statement. CustomerIdentity and CustomerSession cascade; Lead.customerId
  // is set null. Doing it by hand in a transaction would just be a second, worse
  // copy of rules the schema already states — and one that drifts the first time
  // a new relation is added.
  await prisma.customerUser.delete({ where: { id: customerId } });

  // ── Then tell Apple, and only then ────────────────────────────────────────
  // Deliberately after the local delete and off the response path. Apple's
  // endpoint is a third party that can be slow, rate-limited or down, and a
  // customer who pressed "delete my account" must not be told it failed because
  // of any of that. The local deletion is the promise; the revocation is the
  // courtesy that keeps their Apple settings honest.
  if (appleToken) {
    const clientId = primaryAppleClientId();
    if (clientId) {
      runAfterResponse(() => revokeAppleRefreshToken(appleToken, clientId));
    }
  }

  return {
    leadsDetached,
    sessionsRevoked,
    appleRevocationScheduled: Boolean(appleToken),
  };
}

/**
 * The customer's Apple refresh token, decrypted, or null if there isn't a usable
 * one.
 *
 * Null is the common case and never an error: most accounts are Google or
 * password, most deploys before this shipped stored no token, and a row written
 * under a since-rotated encryption key simply fails to open. All of them mean
 * the same thing to the caller — nothing to revoke.
 */
async function appleRefreshTokenFor(customerId: string): Promise<string | null> {
  if (!isAppleServerAuthConfigured()) return null;

  const identity = await prisma.customerIdentity.findFirst({
    where: { customerId, provider: "APPLE" },
    select: { refreshTokenEnc: true },
  });

  return open(identity?.refreshTokenEnc);
}
