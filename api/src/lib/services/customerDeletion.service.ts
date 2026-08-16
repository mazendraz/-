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
 */
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/utils/errors";
import * as audit from "@/lib/services/audit.service";

export interface DeletionSummary {
  /** Requests whose account link was severed — they remain with their company. */
  leadsDetached: number;
  sessionsRevoked: number;
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

  const [leadsDetached, sessionsRevoked] = await Promise.all([
    prisma.lead.count({ where: { customerId } }),
    prisma.customerSession.count({ where: { customerId, revokedAt: null } }),
  ]);

  await audit.recordAuth({
    action: "auth.customer.deleted",
    email: customer.email,
    userId: customer.id,
    ip,
    meta: { leadsDetached, sessionsRevoked },
  });

  // One statement. CustomerIdentity and CustomerSession cascade; Lead.customerId
  // is set null. Doing it by hand in a transaction would just be a second, worse
  // copy of rules the schema already states — and one that drifts the first time
  // a new relation is added.
  await prisma.customerUser.delete({ where: { id: customerId } });

  return { leadsDetached, sessionsRevoked };
}
