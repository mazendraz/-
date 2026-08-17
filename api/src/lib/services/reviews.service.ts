// Company review management (admin only). Every add/remove recomputes the
// company's aggregate rating + reviewCount (mirrors addReview in
// app/src/lib/catalog.ts: rating = round(avg, 1 decimal), 0 when empty).
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type { Prisma } from "@/generated/prisma/client";
import { CompanyStatus, LeadStatus } from "@/generated/prisma/enums";
import { serializeReview, serializeReviewAdmin } from "@/lib/utils/serialize";
import { leadSecretMatches } from "@/lib/services/leads.service";
import { notifyAdmins as pushAdmins } from "@/lib/services/push.service";
import { notifyAdminsReviewSubmitted } from "@/lib/services/notifications.service";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import { runAfterResponse } from "@/lib/utils/afterResponse";
import type { SubmitReviewInput } from "@/lib/validation/reviews";
import type { ApiPage, ApiReview } from "@/lib/apiTypes";

/**
 * Alert admins that a customer left a review — Web Push + email. Fire-and-forget
 * and fail-open: never blocks or fails the customer's submission.
 */
async function notifyAdminsNewReview(companyId: string, rating: number, author: string): Promise<void> {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const companyName = company?.name ?? "A company";

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { email: true },
    });
    // Awaited (via allSettled) so the enclosing runAfterResponse keeps the
    // serverless function alive until both channels actually send.
    await Promise.allSettled([
      pushAdmins({
        title: "New review to approve",
        body: `${companyName} — ${"★".repeat(rating)} from ${author}`,
        url: "/admin",
        tag: `review-${companyId}-${Date.now()}`,
      }),
      notifyAdminsReviewSubmitted({ companyName, rating, author, adminEmails: admins.map((a) => a.email) }),
    ]);
  } catch (err) {
    console.error("[notify] new-review admin alert failed:", err);
  }
}

export interface AdminReviewItem extends ApiReview {
  companyId: string;
  companyName: string;
  companySlug: string;
}

const ADMIN_REVIEW_DEFAULT_PAGE_SIZE = 50;
const ADMIN_REVIEW_MAX_PAGE_SIZE = 100;

export interface AdminReviewListQuery {
  approved?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Admin: verified customer reviews across all companies, newest first, PAGED.
 *
 * This was `take: 200` with no paging and no total. Nothing failed at 201 —
 * the 201st pending review simply was not in the response, and the screen gave
 * no sign that it existed. A moderation queue that silently hides work is worse
 * than a slow one: the reviews are invisible to the admin AND invisible to the
 * public (unapproved reviews are hidden and excluded from the rating), so they
 * sit unreviewed forever with nothing anywhere reporting a backlog.
 *
 * Paged with a real `total`, so the UI can say how much work is actually
 * waiting — which is the number that was missing, more than the rows were.
 */
export async function listAllForAdmin(
  query: AdminReviewListQuery = {},
): Promise<ApiPage<AdminReviewItem>> {
  const where: Prisma.ReviewWhereInput = { verified: true };
  if (typeof query.approved === "boolean") where.approved = query.approved;

  const page = clampPage(query.page);
  const pageSize = clampPageSize(
    query.pageSize,
    ADMIN_REVIEW_DEFAULT_PAGE_SIZE,
    ADMIN_REVIEW_MAX_PAGE_SIZE,
  );

  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { company: { select: { id: true, name: true, slug: true } } },
    }),
  ]);

  return {
    data: rows.map((r) => ({
      ...serializeReviewAdmin(r),
      companyId: r.company.id,
      companyName: r.company.name,
      companySlug: r.company.slug,
    })),
    meta: { total, page, pageSize },
  };
}

/** Admin: approve (or un-approve) a review, then recompute the company aggregate. */
export async function setApproved(reviewId: string, approved: boolean): Promise<ApiReview> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, companyId: true },
  });
  if (!review) throw new NotFoundError("Review");
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({ where: { id: reviewId }, data: { approved } });
    await recompute(tx, review.companyId);
    return r;
  });
  return serializeReviewAdmin(updated);
}

/** Admin: delete any review by id (recomputes the company aggregate). */
export async function removeById(reviewId: string): Promise<void> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, companyId: true },
  });
  if (!review) throw new NotFoundError("Review");
  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    await recompute(tx, review.companyId);
  });
}

export interface ReviewInput {
  author: string;
  avatar?: string;
  rating: number; // 1..5
  text: string;
  date: string;
  district: string;
}

export interface ReviewListQuery {
  search?: string; // matches author / text / district
  rating?: number; // exact star filter (1..5)
  page?: number;
  pageSize?: number;
}

const REVIEW_DEFAULT_PAGE_SIZE = 12;
const REVIEW_MAX_PAGE_SIZE = 50;

/**
 * Public: paginated + searchable reviews for one ACTIVE company (by slug). Lets the
 * provider dashboard / public profile page over the COMPLETE review history instead
 * of the 50-row cap baked into the company-detail payload. Newest first.
 */
export async function listByCompanySlug(
  slug: string,
  query: ReviewListQuery,
): Promise<ApiPage<ApiReview>> {
  const company = await prisma.company.findFirst({
    where: { slug, status: CompanyStatus.ACTIVE },
    select: { id: true },
  });
  // 404 for missing or non-ACTIVE — same as the profile endpoint.
  if (!company) throw new NotFoundError("Company");

  // Public/provider listing shows APPROVED reviews only (pending ones are hidden
  // until an admin approves them).
  const where: Prisma.ReviewWhereInput = { companyId: company.id, approved: true };
  if (query.rating && query.rating >= 1 && query.rating <= 5) where.rating = query.rating;
  const s = query.search?.trim();
  if (s) {
    where.OR = [
      { author: { contains: s, mode: "insensitive" } },
      { text: { contains: s, mode: "insensitive" } },
      { district: { contains: s, mode: "insensitive" } },
    ];
  }

  const page = clampPage(query.page);
  const pageSize = clampPageSize(
    query.pageSize,
    REVIEW_DEFAULT_PAGE_SIZE,
    REVIEW_MAX_PAGE_SIZE,
  );

  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serializeReview), meta: { total, page, pageSize } };
}

type TxClient = Prisma.TransactionClient;

/**
 * Recompute and persist rating (avg, 1 decimal) + reviewCount for a company.
 * No-op when an admin has manually overridden the rating (ratingOverridden=true):
 * their values stay until the override is cleared.
 */
async function recompute(client: TxClient, companyId: string): Promise<void> {
  const company = await client.company.findUnique({
    where: { id: companyId },
    select: { ratingOverridden: true },
  });
  if (company?.ratingOverridden) return;

  // Only APPROVED reviews contribute to the public rating/count.
  const agg = await client.review.aggregate({
    where: { companyId, approved: true },
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
        // Admin-curated reviews are published immediately.
        approved: true,
      },
    });
    await recompute(tx, companyId);
    return created;
  });

  return serializeReviewAdmin(review);
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
type ReviewableLead = {
  id: string;
  companyId: string;
  customerName: string;
  district: string;
  status: LeadStatus;
  reviewedAt: Date | null;
};

/**
 * The claim-and-create transaction shared by both entry points below — the
 * ref+token path (submitFromLead, pre-account) and the account-owned path
 * (submitFromLeadId, mobile/customer). Everything about WHO may call this is
 * decided by the caller resolving `lead` first; this only enforces WHAT state
 * a lead must be in to be reviewable, which is identical either way.
 */
async function claimAndCreate(
  lead: ReviewableLead,
  rating: number,
  text: string,
): Promise<ApiReview> {
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
        rating,
        text,
        date,
        district: lead.district,
        verified: true,
      },
    });
    await recompute(tx, lead.companyId);
    return created;
  });

  // Alert admins a new customer review came in (push + email) after the response.
  runAfterResponse(() => notifyAdminsNewReview(lead.companyId, rating, lead.customerName));

  return serializeReview(review);
}

/** Pre-account path: gated by ref + tracking token (or phone for legacy leads). */
export async function submitFromLead(input: SubmitReviewInput): Promise<ApiReview> {
  const lead = await prisma.lead.findUnique({
    where: { refNumber: input.ref },
    select: {
      id: true, companyId: true, customerName: true, district: true,
      phone: true, trackingToken: true, status: true, reviewedAt: true,
    },
  });
  // Missing ref and secret mismatch both return 404 — don't reveal valid refs.
  if (!lead || !leadSecretMatches(lead, { token: input.token, phone: input.phone })) {
    throw new NotFoundError("Lead");
  }
  return claimAndCreate(lead, input.rating, input.text);
}

/**
 * Account-owned path: gated by the signed-in customer actually owning the
 * lead — no ref, no token, matching every other /customer/* route's rule that
 * the account itself is the credential.
 */
export async function submitFromLeadId(
  leadId: string,
  customerId: string,
  rating: number,
  text: string,
): Promise<ApiReview> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, companyId: true, customerName: true, district: true,
      status: true, reviewedAt: true, customerId: true,
    },
  });
  // A missing lead and one owned by someone else get the SAME 404 — same
  // reasoning as every other ownership check in this codebase.
  if (!lead || lead.customerId !== customerId) throw new NotFoundError("Lead");
  return claimAndCreate(lead, rating, text);
}
