// Company review management (admin only). Every add/remove recomputes the
// company's aggregate rating + reviewCount (mirrors addReview in
// app/src/lib/catalog.ts: rating = round(avg, 1 decimal), 0 when empty).
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { LeadStatus } from "@/generated/prisma/enums";
import { serializeReview } from "@/lib/utils/serialize";
import { leadSecretMatches } from "@/lib/services/leads.service";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import type { SubmitReviewInput } from "@/lib/validation/reviews";
import type { ApiReview } from "@/lib/apiTypes";

export interface ReviewInput {
  author: string;
  avatar?: string;
  rating: number; // 1..5
  text: string;
  date: string;
  district: string;
}

type TxClient = Prisma.TransactionClient;

/** Recompute and persist rating (avg, 1 decimal) + reviewCount for a company. */
async function recompute(client: TxClient, companyId: string): Promise<void> {
  const agg = await client.review.aggregate({
    where: { companyId },
    _avg: { rating: true },
    _count: true,
  });
  const reviewCount = agg._count;
  const rating = reviewCount
    ? Math.round((agg._avg.rating ?? 0) * 10) / 10
    : 0;
  await client.company.update({
    where: { id: companyId },
    data: { rating, reviewCount },
  });
}

/** Admin: add a review, then recompute the company's aggregate. */
export async function add(
  companyId: string,
  input: ReviewInput,
): Promise<ApiReview> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company");

  const avatar =
    input.avatar?.trim() || input.author.trim().charAt(0).toUpperCase() || "?";

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        companyId,
        author: input.author,
        avatar,
        rating: input.rating,
        text: input.text,
        date: input.date,
        district: input.district,
      },
    });
    await recompute(tx, companyId);
    return created;
  });

  return serializeReview(review);
}

/** Admin: delete a review, then recompute the company's aggregate. */
export async function remove(
  companyId: string,
  reviewId: string,
): Promise<void> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, companyId },
    select: { id: true },
  });
  if (!review) throw new NotFoundError("Review");

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    await recompute(tx, companyId);
  });
}

/** Recompute a company's aggregate outside an add/delete (e.g. data fixes). */
export async function recomputeAggregate(companyId: string): Promise<void> {
  await prisma.$transaction((tx) => recompute(tx, companyId));
}

/**
 * Public: a customer submits a VERIFIED review for their own completed lead.
 * Gated by refNumber + matching phone (the same shared secret as lead tracking).
 * One review per lead: the lead's reviewedAt is stamped in the same transaction.
 * author/date/district are taken from the lead, so reviews can't be spoofed for
 * an arbitrary company. Recomputes the company aggregate like the admin path.
 */
export async function submitFromLead(input: SubmitReviewInput): Promise<ApiReview> {
  const lead = await prisma.lead.findUnique({
    where: { refNumber: input.ref },
    select: {
      id: true,
      companyId: true,
      customerName: true,
      district: true,
      phone: true,
      trackingToken: true,
      status: true,
      reviewedAt: true,
    },
  });
  // Missing ref and secret mismatch both return 404 — don't reveal valid refs.
  if (!lead || !leadSecretMatches(lead, { token: input.token, phone: input.phone })) {
    throw new NotFoundError("Lead");
  }
  if (lead.status !== LeadStatus.COMPLETED) {
    throw new ConflictError("Only completed requests can be reviewed.");
  }
  // Fast-path, friendly error for the common (non-racing) case. The authoritative
  // guard is the conditional claim inside the transaction below — two concurrent
  // submits can both pass this read, so it must NOT be the only check.
  if (lead.reviewedAt) {
    throw new ConflictError("This request has already been reviewed.");
  }

  const avatar = lead.customerName.trim().charAt(0).toUpperCase() || "?";
  const date = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const review = await prisma.$transaction(async (tx) => {
    // Atomically claim the one-time review slot: only the first concurrent caller
    // flips reviewedAt from null (the row lock serializes the rest), so only it
    // proceeds. Losers match 0 rows → 409, and the whole transaction rolls back.
    const claimed = await tx.lead.updateMany({
      where: { id: lead.id, reviewedAt: null },
      data: { reviewedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ConflictError("This request has already been reviewed.");
    }
    const created = await tx.review.create({
      data: {
        companyId: lead.companyId,
        leadId: lead.id, // links the review to its lead; UNIQUE backstops the claim
        author: lead.customerName,
        avatar,
        rating: input.rating,
        text: input.text,
        date,
        district: lead.district,
        verified: true,
      },
    });
    await recompute(tx, lead.companyId);
    return created;
  });

  return serializeReview(review);
}
