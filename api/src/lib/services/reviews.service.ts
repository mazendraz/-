// Company review management (admin only). Every add/remove recomputes the
// company's aggregate rating + reviewCount (mirrors addReview in
// app/src/lib/catalog.ts: rating = round(avg, 1 decimal), 0 when empty).
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { serializeReview } from "@/lib/utils/serialize";
import { NotFoundError } from "@/lib/utils/errors";
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
