// Lead business logic. Public submit implemented here (Phase 4); provider/admin
// listing + status transitions land in Phase 8.
import { prisma } from "@/lib/prisma";
import { CompanyStatus, LeadStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { generateRefNumber } from "@/lib/utils/refNumber";
import { phoneTail } from "@/lib/utils/phone";
import { leadStatusFromLabel, serializeLead } from "@/lib/utils/serialize";
import { notifyNewLead } from "@/lib/services/notifications.service";
import { NotFoundError } from "@/lib/utils/errors";
import type {
  ApiLead,
  ApiLeadPayload,
  ApiLeadStatus,
  ApiPage,
} from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const leadInclude = {
  company: { select: { slug: true, name: true } },
} as const;

function clampPaging(query: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const rawSize =
    Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));
  return { page, pageSize };
}

async function listWhere(
  where: Prisma.LeadWhereInput,
  query: { page?: number; pageSize?: number },
): Promise<ApiPage<ApiLead>> {
  const { page, pageSize } = clampPaging(query);
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serializeLead), meta: { total, page, pageSize } };
}

/**
 * Public: create a lead. Resolves the company by slug (must be ACTIVE), generates
 * a unique refNumber, sets status NEW, and returns the full RAW ApiLead.
 */
export async function create(payload: ApiLeadPayload): Promise<ApiLead> {
  const company = await prisma.company.findFirst({
    where: { slug: payload.companySlug, status: CompanyStatus.ACTIVE },
    select: { id: true, name: true, email: true, whatsapp: true },
  });
  // 404 for both missing and non-ACTIVE — don't reveal suspended companies.
  if (!company) throw new NotFoundError("Company");

  // refNumber is unique; on the (extremely rare) collision, retry with a new one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const lead = await prisma.lead.create({
        data: {
          companyId: company.id,
          refNumber: generateRefNumber(),
          service: payload.service,
          customerName: payload.name,
          phone: payload.phone,
          district: payload.district,
          budget: payload.budget,
          description: payload.description,
          status: LeadStatus.NEW,
        },
        include: leadInclude,
      });
      const serialized = serializeLead(lead);

      // Notify the provider — fire-and-forget; never blocks or fails the response.
      // (In a serverless deploy, wrap this in the platform's waitUntil instead.)
      void notifyNewLead(serialized, {
        email: company.email,
        whatsapp: company.whatsapp,
        companyName: company.name,
      });

      return serialized;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "P2002" && attempt < 4) continue; // refNumber clash — retry
      throw err;
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error("Failed to generate a unique lead reference");
}

export interface LeadListQuery {
  status?: ApiLeadStatus; // by label, e.g. "In Progress"
  page?: number;
  pageSize?: number;
}

export interface AdminLeadListQuery extends LeadListQuery {
  companyId?: string;
  from?: Date; // createdAt >= from
  to?: Date; // createdAt <= to
}

/** Provider: leads belonging to one company (filterable by status label). */
export async function listByCompany(
  companyId: string,
  query: LeadListQuery,
): Promise<ApiPage<ApiLead>> {
  const where: Prisma.LeadWhereInput = { companyId };
  if (query.status) where.status = leadStatusFromLabel(query.status);
  return listWhere(where, query);
}

/** Admin: all leads, filterable by company / status / date range. */
export async function listAll(
  query: AdminLeadListQuery,
): Promise<ApiPage<ApiLead>> {
  const where: Prisma.LeadWhereInput = {};
  if (query.companyId) where.companyId = query.companyId;
  if (query.status) where.status = leadStatusFromLabel(query.status);
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  return listWhere(where, query);
}

/**
 * Public: look up a single lead by its reference number, gated by a matching
 * phone (a shared secret only the submitter knows). Returns the customer's own
 * lead so they can track its status without an account. Both a missing ref and a
 * phone mismatch throw the SAME 404 — never reveal which refNumbers exist.
 */
export async function trackByRefAndPhone(
  refNumber: string,
  phone: string,
): Promise<ApiLead> {
  const lead = await prisma.lead.findUnique({
    where: { refNumber },
    include: leadInclude,
  });
  if (!lead || phoneTail(lead.phone) !== phoneTail(phone)) {
    throw new NotFoundError("Lead");
  }
  return serializeLead(lead);
}

/** Returns a lead's owning companyId, or throws 404. (For ownership checks.) */
export async function getOwnerCompanyId(id: string): Promise<string> {
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!lead) throw new NotFoundError("Lead");
  return lead.companyId;
}

/** Provider (ownership-checked by caller) / Admin: update a lead's status. */
export async function updateStatus(
  id: string,
  status: ApiLeadStatus,
): Promise<ApiLead> {
  const lead = await prisma.lead.update({
    where: { id },
    data: { status: leadStatusFromLabel(status) },
    include: leadInclude,
  });
  return serializeLead(lead);
}

/** Admin: delete a lead. */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Lead");
  await prisma.lead.delete({ where: { id } });
}
