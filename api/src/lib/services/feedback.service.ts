// Feedback (company "Report a problem" / suggestion / inquiry) business logic.
// Public submissions resolve the company by slug; admins list/triage/delete.
// Mirrors siteReviews.service.ts, plus enum mapping (Prisma UPPERCASE ↔ API label)
// and company slug/name resolved from the relation.
import { prisma } from "@/lib/prisma";
import { CompanyStatus, FeedbackType } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/utils/errors";
import type {
  ApiFeedback,
  ApiFeedbackPayload,
  ApiFeedbackType,
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

/** Admin: all feedback, newest first. */
export async function listAll(): Promise<ApiFeedback[]> {
  const rows = await prisma.feedback.findMany({
    include: feedbackInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
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
