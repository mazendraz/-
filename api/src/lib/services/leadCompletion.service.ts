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
import { LeadStatus, LeadVerificationStatus } from "@/generated/prisma/enums";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import { serializeLead, type LeadWithCompany } from "@/lib/utils/serialize";
import { leadInclude, leadSecretMatches } from "@/lib/services/leads.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";
import {
  notifyProviderAmountConfirmed,
  notifyProviderAmountDiscrepancy,
} from "@/lib/services/notifications.service";
import { notifyCompanyProviders as pushCompanyProviders } from "@/lib/services/push.service";
import { notifyProviderChatTelegram } from "@/lib/services/telegram.service";
import type { ApiLead } from "@/lib/apiTypes";
import type { CompleteLeadInput, VerifyLeadInput } from "@/lib/validation/leadCompletion";

/**
 * Provider: mark a lead completed with the final amount (+ optional additional
 * work). One-time — a second attempt is a 409, both via this explicit check
 * (friendly message) and, for the race window, the leadId unique constraint
 * (mapped to 409 by withErrors on a raw P2002).
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
    return tx.lead.update({
      where: { id: leadId },
      data: { status: LeadStatus.COMPLETED },
      include: leadInclude,
    });
  });

  // No client notification: the client has no account/channel of their own (see
  // the module comment) — they discover this the next time they open the app,
  // via the mandatory verification gate (app/src/RootLayout.tsx).
  return serializeLead(lead as LeadWithCompany);
}

function formatEgp(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US")}`;
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

/**
 * Public: client confirms or disputes the provider's reported amount. Gated by
 * refNumber + tracking token (or phone) — identical trust model to
 * reviews.service.submitFromLead / leads.service.trackByRefAndSecret. A missing
 * ref and a secret mismatch both throw the SAME 404.
 *
 * The PENDING -> resolved transition is claimed atomically (conditional
 * updateMany, matching submitFromLead's reviewedAt claim) so two concurrent
 * submits — or a resubmit — can only succeed once.
 */
export async function verify(input: VerifyLeadInput): Promise<ApiLead> {
  const lead = await prisma.lead.findUnique({
    where: { refNumber: input.ref },
    include: {
      ...leadInclude,
      company: { select: { id: true, name: true, email: true, whatsapp: true, slug: true } },
    },
  });
  if (!lead || !leadSecretMatches(lead, { token: input.token, phone: input.phone })) {
    throw new NotFoundError("Lead");
  }
  if (!lead.completion) {
    throw new ConflictError("This request has not been marked completed yet.");
  }
  if (lead.completion.verificationStatus !== LeadVerificationStatus.PENDING) {
    throw new ConflictError("This amount has already been verified.");
  }

  const finalTotal = lead.completion.providerAmount + (lead.completion.additionalWorkAmount ?? 0);
  const data =
    input.decision === "confirmed"
      ? {
          verificationStatus: LeadVerificationStatus.CONFIRMED,
          clientAmount: finalTotal,
          discrepancyNote: null,
          verifiedAt: new Date(),
        }
      : {
          verificationStatus: LeadVerificationStatus.DISCREPANCY,
          // Required by verifyLeadSchema when decision === "discrepancy".
          clientAmount: input.clientAmount as number,
          discrepancyNote: input.note ?? null,
          verifiedAt: new Date(),
        };

  const claimed = await prisma.leadCompletion.updateMany({
    where: { leadId: lead.id, verificationStatus: LeadVerificationStatus.PENDING },
    data,
  });
  if (claimed.count === 0) {
    // Lost the race against a concurrent verify — same message as the pre-check.
    throw new ConflictError("This amount has already been verified.");
  }

  const updated = await prisma.lead.findUniqueOrThrow({
    where: { id: lead.id },
    include: leadInclude,
  });
  const serialized = serializeLead(updated as LeadWithCompany);

  // Only the provider is notified — see the module comment on why the client
  // isn't. Fail-open fan-out, same shape as leads.service.createLeadRecord.
  runAfterResponse(async () => {
    const target = { email: lead.company.email, whatsapp: lead.company.whatsapp, companyName: lead.company.name };
    await Promise.allSettled([
      input.decision === "confirmed"
        ? notifyProviderAmountConfirmed(serialized, target)
        : notifyProviderAmountDiscrepancy(serialized, target),
      pushCompanyProviders(lead.companyId, {
        title: verificationPushTitle(input.decision),
        body: `${serialized.service} · ${serialized.refNumber}`,
        url: "/provider",
        tag: `lead-verify-${lead.id}`,
      }),
      notifyProviderChatTelegram(lead.companyId, verificationTelegramText(serialized, input.decision)),
    ]);
  });

  return serialized;
}
