// Feedback (company "Report a problem" / suggestion / inquiry) business logic.
// Public submissions resolve the company by slug; admins list/triage/delete.
// Mirrors siteReviews.service.ts, plus enum mapping (Prisma UPPERCASE ↔ API label)
// and company slug/name resolved from the relation.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CompanyStatus, FeedbackType } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/utils/errors";
import type {
  ApiFeedback,
  ApiFeedbackPayload,
  ApiFeedbackType,
  ApiPage,
} from "@/lib/apiTypes";

const TYPE_TO_LABEL: Record<FeedbackType, ApiFeedbackType> = {
  [FeedbackType.PROBLEM]: "problem",
  [FeedbackType.SUGGESTION]: "suggestion",
  [FeedbackType.INQUIRY]: "inquiry",
};

const LABEL_TO_TYPE: Record<ApiFeedbackType, FeedbackType> = {
  problem: FeedbackType.PROBLEM,
  suggestion: FeedbackType.SUGGESTION,
  inquiry: FeedbackType.INQUIRY,
};

const feedbackInclude = {
  company: { select: { slug: true, name: true } },
} as const;

// Structural row type — avoids depending on generated model-type exports.
interface FeedbackRow {
  id: string;
  type: FeedbackType;
  name: string | null;
  phone: string | null;
  message: string;
  isRead: boolean;
  createdAt: Date;
  company: { slug: string; name: string };
}

function serialize(r: FeedbackRow): ApiFeedback {
  return {
    id: r.id,
    companySlug: r.company.slug,
    companyName: r.company.name,
    type: TYPE_TO_LABEL[r.type],
    name: r.name,
    phone: r.phone,
    message: r.message,
    isRead: r.isRead,
    createdAt: r.createdAt.getTime(), // DateTime → epoch ms
  };
}

/** Public: create feedback for an ACTIVE company (resolved by slug). 404 otherwise
 *  — matches lead/review, and the public UI only surfaces ACTIVE companies. */
export async function create(payload: ApiFeedbackPayload): Promise<ApiFeedback> {
  const company = await prisma.company.findFirst({
    where: { slug: payload.companySlug, status: CompanyStatus.ACTIVE },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company");

  const row = await prisma.feedback.create({
    data: {
      companyId: company.id,
      type: LABEL_TO_TYPE[payload.type],
      name: payload.name?.trim() || null,
      phone: payload.phone?.trim() || null,
      message: payload.message,
      isRead: false,
    },
    include: feedbackInclude,
  });
  return serialize(row);
}

export interface FeedbackListQuery {
  search?: string; // matches name / phone / message / company name
  page?: number;
  pageSize?: number;
}

const FEEDBACK_DEFAULT_PAGE_SIZE = 20;
const FEEDBACK_MAX_PAGE_SIZE = 100;

/** Case-insensitive OR filter across the human-searchable feedback fields. */
function feedbackSearchWhere(search?: string): Prisma.FeedbackWhereInput {
  const s = search?.trim();
  if (!s) return {};
  return {
    OR: [
      { name: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { message: { contains: s, mode: "insensitive" } },
      { company: { name: { contains: s, mode: "insensitive" } } },
    ],
  };
}

/**
 * Admin: all feedback, newest first. Optional `search` filters in the DB. Returns
 * the full (filtered) array — the default response shape is unchanged, so existing
 * callers keep working. Use `listPage` when you need bounded pagination.
 */
export async function listAll(query: FeedbackListQuery = {}): Promise<ApiFeedback[]> {
  const rows = await prisma.feedback.findMany({
    where: feedbackSearchWhere(query.search),
    include: feedbackInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
}

/** Admin: paginated feedback (newest first), filterable by `search`. */
export async function listPage(query: FeedbackListQuery): Promise<ApiPage<ApiFeedback>> {
  const where = feedbackSearchWhere(query.search);
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const pageSize = Math.min(
    FEEDBACK_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? FEEDBACK_DEFAULT_PAGE_SIZE) || FEEDBACK_DEFAULT_PAGE_SIZE),
  );
  const [total, rows] = await Promise.all([
    prisma.feedback.count({ where }),
    prisma.feedback.findMany({
      where,
      include: feedbackInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, pageSize } };
}

/** Admin: mark a feedback item read/unread. */
export async function markRead(id: string, isRead: boolean): Promise<ApiFeedback> {
  const existing = await prisma.feedback.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Feedback");
  const row = await prisma.feedback.update({
    where: { id },
    data: { isRead },
    include: feedbackInclude,
  });
  return serialize(row);
}

/** Admin: delete a feedback item. */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.feedback.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Feedback");
  await prisma.feedback.delete({ where: { id } });
}
