// Lead business logic. Public submit implemented here (Phase 4); provider/admin
// listing + status transitions land in Phase 8.
import { prisma } from "@/lib/prisma";
import { CompanyStatus, LeadStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { generateRefNumber } from "@/lib/utils/refNumber";
import { generateTrackingToken, safeEqual } from "@/lib/utils/token";
import { phoneTail } from "@/lib/utils/phone";
import { leadStatusFromLabel, serializeLead } from "@/lib/utils/serialize";
import { notifyNewLead, notifyAdmins } from "@/lib/services/notifications.service";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import type {
  ApiLead,
  ApiLeadPayload,
  ApiLeadStatus,
  ApiPage,
} from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Soft de-dup window: collapse an identical (company + phone + service) re-submit
// within this window into a 409. Blunts double-click and basic bot spam; it is NOT
// the primary defense (rate limit + CAPTCHA are) — a bot varying any field bypasses
// it, which is acceptable for a UX/noise guard.
const DEDUP_WINDOW_MS = 5 * 60_000;

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

  // Reject a near-identical re-submit (double-click / retry / basic bot loop).
  const recentDuplicate = await prisma.lead.findFirst({
    where: {
      companyId: company.id,
      phone: payload.phone,
      service: payload.service,
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recentDuplicate) {
    throw new ConflictError(
      "We already received an identical request a moment ago. We'll be in touch shortly.",
    );
  }

  // refNumber is unique; on the (extremely rare) collision, retry with a new one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const lead = await prisma.lead.create({
        data: {
          companyId: company.id,
          refNumber: generateRefNumber(),
          trackingToken: generateTrackingToken(),
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
      // Include the token ONLY on the creation response (stored client-side); it's
      // never surfaced in admin/provider list payloads.
      const serialized = { ...serializeLead(lead), trackingToken: lead.trackingToken ?? undefined };

      // Notify the provider — fire-and-forget; never blocks or fails the response.
      // (In a serverless deploy, wrap this in the platform's waitUntil instead.)
      void notifyNewLead(serialized, {
        email: company.email,
        whatsapp: company.whatsapp,
        companyName: company.name,
      });

      // Notify all active admins too — sourced from the User table so it tracks
      // the Team tab automatically (no env var to keep in sync). Also fail-open.
      void prisma.user
        .findMany({
          where: { role: "ADMIN", isActive: true },
          select: { email: true },
        })
        .then((admins) => notifyAdmins(serialized, company.name, admins.map((a) => a.email)))
        .catch((err) => console.error(`[notify] admin lookup failed for lead ${serialized.refNumber}:`, err));

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
 * Verify the public secret for a lead. Prefers the high-entropy trackingToken
 * (constant-time compared); falls back to phone-tail matching ONLY for legacy
 * leads created before the token column existed (trackingToken == null).
 */
export function leadSecretMatches(
  lead: { trackingToken: string | null; phone: string },
  secret: { token?: string; phone?: string },
): boolean {
  if (lead.trackingToken) {
    return typeof secret.token === "string" && safeEqual(secret.token, lead.trackingToken);
  }
  return typeof secret.phone === "string" && phoneTail(lead.phone) === phoneTail(secret.phone);
}

/**
 * Public: look up a single lead by its reference number, gated by the tracking
 * token (or phone for legacy leads). Returns the customer's own lead so they can
 * track its status without an account. A missing ref and a secret mismatch throw
 * the SAME 404 — never reveal which refNumbers exist.
 */
export async function trackByRefAndSecret(
  refNumber: string,
  secret: { token?: string; phone?: string },
): Promise<ApiLead> {
  const lead = await prisma.lead.findUnique({
    where: { refNumber },
    include: leadInclude,
  });
  if (!lead || !leadSecretMatches(lead, secret)) {
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
