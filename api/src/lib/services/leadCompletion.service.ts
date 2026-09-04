// Service Completion & Final Price Verification business logic.
//
// Two entry points, mirroring the existing Lead/Review services closely:
//   submitCompletion — provider marks a lead done with the final amount.
//   verify           — public, ref+secret gated: client confirms or disputes it.
//
// No new LeadStatus value: completion flips Lead.status straight to COMPLETED,
// the one status reviews.service.submitFromLead already gates the review flow
// on. "Confirmed vs discrepancy" lives entirely in LeadCompletion.verificationStatus.
import { prisma } from "@/lib/prisma";
import { LeadStatus, LeadVerificationStatus, NotificationType, StaffNotificationType } from "@/generated/prisma/enums";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { serializeLead, type LeadWithCompany } from "@/lib/utils/serialize";
// COMPLETABLE_FROM is derived from the LEAD_TRANSITIONS graph rather than
// restated here, so the completion form and PATCH /leads/:id can never disagree
// about when a job may be closed out.
import { COMPLETABLE_FROM, leadInclude, leadSecretMatches } from "@/lib/services/leads.service";
import { ADMIN_CHANNEL, channelForCompany, channelForCustomer, publishAll } from "@/lib/services/realtime.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";
import {
  notifyProviderAmountConfirmed,
  notifyProviderAmountDiscrepancy,
  notifyAdminsAmountDiscrepancy,
  notifyCustomerServiceSummary,
} from "@/lib/services/notifications.service";
import { notifyCompanyProviders as pushCompanyProviders, notifyAdmins as pushAdmins } from "@/lib/services/push.service";
import { notifyCustomer } from "@/lib/services/notifications.customer.service";
import {
  notifyProviderChatTelegram,
  notifyAdminChatTelegram,
} from "@/lib/services/telegram.service";
// Business Control Center: commission recognizes on client verification (see
// the delivered architecture doc §6/§9 — decided, not guessed) — recognized
// atomically alongside the verification claim below, in the SAME db
// transaction, so a crash between "verified" and "revenue recorded" can never
// happen.
import { recognizeCommission } from "@/lib/services/finance.service";
import type { ApiLead } from "@/lib/apiTypes";
import type { CompleteLeadInput, VerifyLeadInput, VerifyOwnedLeadInput } from "@/lib/validation/leadCompletion";

/**
 * Provider: mark a lead completed with the final amount (+ optional additional
 * work). One-time — a second attempt is a 409, both via this explicit check
 * (friendly message) and, for the race window, the leadId unique constraint
 * (mapped to 409 by withErrors on a raw P2002).
 *
 * The status transition is CLAIMED, not written. A plain `update` here lost to a
 * simultaneous cancel: both writes succeeded, the cancel landed second, and the
 * lead ended up CANCELLED while still carrying a live PENDING completion for
 * 50,000 EGP — a state the product has no meaning for, and one the customer's own
 * app turns into an undismissable "confirm this amount" gate for a job they
 * cancelled. The conditional updateMany below makes the loser fail cleanly
 * instead, in either ordering.
 */
export async function submitCompletion(
  leadId: string,
  input: CompleteLeadInput,
): Promise<ApiLead> {
  const existing = await prisma.leadCompletion.findUnique({
    where: { leadId },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("This lead has already been marked as completed.");
  }

  const lead = await prisma.$transaction(async (tx) => {
    // Claim the transition FIRST. Doing it before the insert means a lead that
    // isn't completable never gets a LeadCompletion row written and rolled
    // back — and, more importantly, that the whole transaction aborts on a lost
    // race rather than leaving the two halves disagreeing.
    const claimed = await tx.lead.updateMany({
      where: { id: leadId, status: { in: [...COMPLETABLE_FROM] } },
      data: { status: LeadStatus.COMPLETED },
    });
    if (claimed.count === 0) {
      // Either the lead is in a status completion may not start from, or a
      // concurrent write moved it out from under us. Both mean the same thing to
      // the provider: this request can't be closed out right now.
      const current = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
      if (!current) throw new NotFoundError("Lead");
      throw new ConflictError(
        current.status === LeadStatus.CANCELLED
          ? "This request was cancelled and can no longer be marked completed."
          : "This request can no longer be marked completed.",
      );
    }

    await tx.leadCompletion.create({
      data: {
        leadId,
        providerAmount: input.providerAmount,
        additionalWorkDescription: input.additionalWork?.description ?? null,
        additionalWorkAmount: input.additionalWork?.amount ?? null,
        notes: input.notes ?? null,
        attachments: input.attachments ?? [],
      },
    });
    return tx.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: leadInclude,
    });
  });

  // Live fan-out. Company + admins ALWAYS — a provider completing a lead on
  // one device (or an admin reviewing it) should see it land everywhere else
  // that's watching, same as leads.service.updateStatus's identical fan-out;
  // see docs/architecture/business-app/phase-4-realtime-push.md's B4. The
  // owning customer only when there is one (a guest-submitted lead has no
  // account/channel to tell — see leads.service.optionalCustomerId). The
  // customer event is what makes the mandatory price-verification gate (the
  // website's RootLayout.tsx, and the mobile client's app/_layout.tsx) catch
  // a completion that lands WHILE the app is already open, rather than only
  // on the next cold start. Synchronous and outside runAfterResponse: an
  // in-memory Set write, not I/O — nothing to gain by deferring it.
  publishAll(
    [
      channelForCompany(lead.companyId),
      ADMIN_CHANNEL,
      ...(lead.customerId ? [channelForCustomer(lead.customerId)] : []),
    ],
    { type: "lead-status", leadId: lead.id },
  );

  if (lead.customerId) {
    // The gate above only catches an app that's already open. Most customers
    // aren't staring at the app the moment a provider finishes — without a
    // push, the mandatory verification (and the commission it unlocks, see
    // recognizeCommission in applyVerification below) just sits PENDING until
    // they happen to reopen it. Fire-and-forget, same fail-open contract as
    // every other push in this codebase.
    runAfterResponse(() =>
      notifyCustomer(lead.customerId!, {
        type: NotificationType.LEAD_COMPLETED,
        title: "تم إنهاء الخدمة — راجع المبلغ النهائي",
        body: `${lead.service} · ${lead.refNumber}`,
        url: "/requests",
        tag: `lead-complete-${lead.id}`,
      }),
    );
  }

  return serializeLead(lead as LeadWithCompany);
}

function formatEgp(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US")}`;
}

// ── Bounding a disputed amount ───────────────────────────────────────────────
// `clientAmount` on a dispute is the ONE money value in this flow that a
// customer chooses, and it is not merely displayed: recognizeCommission
// computes Al Asima's revenue from it and writes a Transaction row. The schema
// cap (validation/shared.ts MAX_MONEY_EGP) stops the absurd end of the range;
// these two bound the rest of it against the job actually performed.
//
// A multiple rather than a fixed ceiling, because a real dispute is relative:
// "you said 5,000, it was 6,500" is the normal case and must pass untouched.
// 10x is far outside any honest disagreement while still leaving room for the
// one genuinely large class of dispute — a provider under-reporting badly.
const MAX_DISPUTE_MULTIPLE = 10;
// ...except when the reported total is 0 or tiny, where a multiple means
// nothing: a provider who reports 0 and a customer who says they paid 8,000 is
// exactly the discrepancy this feature exists to capture. Below this floor any
// amount is accepted, so the multiple only governs disputes that are already
// large in absolute terms.
const DISPUTE_FLOOR_EGP = 1_000_000;

/**
 * Reject a disputed amount that cannot describe the same job the provider
 * reported. Deliberately a ValidationError (400), not a Conflict: it is the
 * submitted number that is wrong, and the customer can correct it and retry.
 */
function assertPlausibleDispute(clientAmount: number, finalTotal: number): void {
  const ceiling = Math.max(DISPUTE_FLOOR_EGP, finalTotal * MAX_DISPUTE_MULTIPLE);
  if (clientAmount > ceiling) {
    throw new ValidationError(
      "That amount is too far from the amount reported for this service. " +
        "Check the figure, or contact support if it is correct.",
      { clientAmount: ["Amount is implausible for this request"] },
    );
  }
}

/** Neutral copy — never "fraud"/"dishonest"/"scam", per product requirement. */
function verificationPushTitle(decision: VerifyLeadInput["decision"]): string {
  return decision === "confirmed"
    ? "Amount confirmed — Al Assema"
    : "Amount discrepancy reported — Al Assema";
}

function verificationTelegramText(lead: ApiLead, decision: VerifyLeadInput["decision"]): string {
  const c = lead.completion;
  if (decision === "confirmed") {
    return (
      `✅ <b>تم تأكيد المبلغ النهائي</b>\n\n` +
      `📄 الطلب: ${lead.refNumber} — ${lead.service}\n` +
      `💰 المبلغ: ${c ? formatEgp(c.finalTotal) : ""}`
    );
  }
  return (
    `⚠️ <b>العميل أبلغ عن مبلغ نهائي مختلف</b>\n\n` +
    `📄 الطلب: ${lead.refNumber} — ${lead.service}\n` +
    `💰 المبلغ المُرسَل: ${c ? formatEgp(c.finalTotal) : ""}\n` +
    `💬 مبلغ العميل: ${c?.clientAmount != null ? formatEgp(c.clientAmount) : ""}\n\n` +
    `تم تسجيل الفرق وهو متاح للمراجعة من الإدارة.`
  );
}

const verificationInclude = {
  ...leadInclude,
  company: { select: { id: true, name: true, email: true, whatsapp: true, slug: true } },
} as const;

function findLeadForVerification(where: { refNumber: string } | { id: string }) {
  return prisma.lead.findUnique({ where, include: verificationInclude });
}

type LeadForVerification = NonNullable<Awaited<ReturnType<typeof findLeadForVerification>>>;

/**
 * The shared core of both verify paths below: given a lead already resolved
 * and OWNERSHIP-CHECKED by the caller (ref+secret, or account id match), apply
 * the client's confirm/dispute decision. Neither caller-specific concern
 * (how the lead was found) nor this transition logic should know about the
 * other — this is the seam between them.
 *
 * The PENDING -> resolved transition is claimed atomically (conditional
 * updateMany, matching submitFromLead's reviewedAt claim) so two concurrent
 * submits — or a resubmit — can only succeed once.
 */
async function applyVerification(
  lead: LeadForVerification,
  decision: "confirmed" | "discrepancy",
  clientAmount: number | undefined,
  note: string | undefined,
): Promise<ApiLead> {
  if (!lead.completion) {
    throw new ConflictError("This request has not been marked completed yet.");
  }
  if (lead.completion.verificationStatus !== LeadVerificationStatus.PENDING) {
    throw new ConflictError("This amount has already been verified.");
  }

  const finalTotal = lead.completion.providerAmount + (lead.completion.additionalWorkAmount ?? 0);

  if (decision === "discrepancy") {
    assertPlausibleDispute(clientAmount as number, finalTotal);
  }

  const data =
    decision === "confirmed"
      ? {
          verificationStatus: LeadVerificationStatus.CONFIRMED,
          clientAmount: finalTotal,
          discrepancyNote: null,
          verifiedAt: new Date(),
        }
      : {
          verificationStatus: LeadVerificationStatus.DISCREPANCY,
          // Required by both schemas when decision === "discrepancy".
          clientAmount: clientAmount as number,
          discrepancyNote: note ?? null,
          verifiedAt: new Date(),
        };

  // Claim the PENDING -> resolved transition AND recognize the commission in
  // one db transaction: either both happen or neither does. See the
  // recognizeCommission import comment above for why this must not be two
  // separate awaits.
  const claimedCount = await prisma.$transaction(async (tx) => {
    const claimed = await tx.leadCompletion.updateMany({
      where: { leadId: lead.id, verificationStatus: LeadVerificationStatus.PENDING },
      data,
    });
    if (claimed.count > 0) {
      await recognizeCommission(tx, {
        leadId: lead.id,
        companyId: lead.companyId,
        clientAmount: data.clientAmount,
        disputed: decision === "discrepancy",
      });
    }
    return claimed.count;
  });
  if (claimedCount === 0) {
    // Lost the race against a concurrent verify — same message as the pre-check.
    throw new ConflictError("This amount has already been verified.");
  }

  const updated = await prisma.lead.findUniqueOrThrow({
    where: { id: lead.id },
    include: leadInclude,
  });
  const serialized = serializeLead(updated as LeadWithCompany);

  // The client gets no PUSH here — see the module comment on why (the
  // in-app card already fired at submitCompletion; this transition is the
  // client's OWN action, so pushing them about a screen they're staring at
  // would be redundant). A CONFIRMED decision (only — a discrepancy isn't a
  // closed, agreed summary) does get an email receipt: the customer-facing
  // counterpart of notifyCustomerOrderPlaced, closing the same story that
  // email opened. The provider always gets notified; a discrepancy ALSO
  // reaches admins (email + push + Telegram), since a mismatched amount is
  // the one verification outcome someone needs to actually act on — a
  // confirmed amount just closes the order quietly.
  // Fail-open fan-out, same shape as leads.service.createLeadRecord.
  runAfterResponse(async () => {
    const target = { email: lead.company.email, whatsapp: lead.company.whatsapp, companyName: lead.company.name };
    const tasks = [
      decision === "confirmed"
        ? notifyProviderAmountConfirmed(serialized, target)
        : notifyProviderAmountDiscrepancy(serialized, target),
      pushCompanyProviders(lead.companyId, {
        type: StaffNotificationType.LEAD_COMPLETED,
        title: verificationPushTitle(decision),
        body: `${serialized.service} · ${serialized.refNumber}`,
        url: "/provider",
        tag: `lead-verify-${lead.id}`,
      }),
      notifyProviderChatTelegram(lead.companyId, verificationTelegramText(serialized, decision)),
    ];
    if (decision === "confirmed" && lead.customerId) {
      const customer = await prisma.customerUser
        .findUnique({ where: { id: lead.customerId }, select: { email: true } })
        .catch((err) => {
          console.error(`[notify] customer lookup failed for summary email on ${serialized.refNumber}:`, err);
          return null;
        });
      tasks.push(
        notifyCustomerServiceSummary(serialized, customer?.email ?? null, lead.customerName, lead.company.name),
      );
    }
    if (decision === "discrepancy") {
      const admins = await prisma.user
        .findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })
        .catch((err) => {
          console.error(`[notify] admin lookup failed for discrepancy on ${serialized.refNumber}:`, err);
          return [] as { email: string }[];
        });
      tasks.push(
        notifyAdminsAmountDiscrepancy(serialized, lead.company.name, admins.map((a) => a.email)),
        pushAdmins({
          type: StaffNotificationType.LEAD_COMPLETED,
          title: `اختلاف في المبلغ — ${lead.company.name}`,
          body: `${serialized.service} · ${serialized.refNumber}`,
          url: "/admin",
          tag: `lead-verify-${lead.id}`,
        }),
        notifyAdminChatTelegram(verificationTelegramText(serialized, decision)),
      );
    }
    await Promise.allSettled(tasks);
  });

  return serialized;
}

/**
 * Public: client confirms or disputes the provider's reported amount. Gated by
 * refNumber + tracking token (or phone) — identical trust model to
 * reviews.service.submitFromLead / leads.service.trackByRefAndSecret. A missing
 * ref and a secret mismatch both throw the SAME 404.
 */
export async function verify(input: VerifyLeadInput): Promise<ApiLead> {
  const lead = await findLeadForVerification({ refNumber: input.ref });
  if (!lead || !leadSecretMatches(lead, { token: input.token, phone: input.phone })) {
    throw new NotFoundError("Lead");
  }
  return applyVerification(lead, input.decision, input.clientAmount, input.note);
}

/**
 * Account-owned counterpart of `verify`, for the app's own price-verification
 * gate. Exists because the token-gated path above is structurally
 * unreachable from a signed-in customer: GET /customer/leads never returns
 * trackingToken (see that route's own comment — the account IS the
 * credential there), so a device that didn't create the lead itself — a
 * reinstall, a second phone, a lead attached later via claimLeads — has no
 * secret to send /leads/verify and gets a permanent 404 on the one screen it
 * cannot dismiss.
 *
 * Ownership here is `Lead.customerId === customer.id`, checked exactly like
 * every other account-owned lead route (see .../leads/[id]/messages/route.ts's
 * resolveOwnedLead) — a missing lead and one owned by someone else get the
 * SAME 404.
 */
export async function verifyOwned(
  leadId: string,
  customerId: string,
  input: VerifyOwnedLeadInput,
): Promise<ApiLead> {
  const lead = await findLeadForVerification({ id: leadId });
  if (!lead || lead.customerId !== customerId) {
    throw new NotFoundError("Request");
  }
  return applyVerification(lead, input.decision, input.clientAmount, input.note);
}
