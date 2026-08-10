// Waiting-list business logic. Public visitors join a busy company's list (resolved
// by slug); providers manage their own company's list; admins manage any company's.
// Contact is off-platform (phone), matching the lead-generation model — mirrors the
// structure of feedback.service.ts.
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type { Prisma } from "@/generated/prisma/client";
import { CompanyStatus, WaitlistStatus } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/utils/errors";
import { serializeWaitlistEntry } from "@/lib/utils/serialize";
import { phoneTail } from "@/lib/utils/phone";
import * as leadsService from "@/lib/services/leads.service";
import type {
  ApiLead,
  ApiPage,
  ApiWaitlistEntry,
  ApiWaitlistPayload,
  ApiWaitlistStatus,
} from "@/lib/apiTypes";

const waitlistInclude = {
  company: { select: { slug: true, name: true } },
} satisfies Prisma.WaitlistEntryInclude;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Public: join an ACTIVE company's waiting list (resolved by slug). 404 if the
 * company doesn't exist / isn't ACTIVE — matches feedback/lead behaviour, and the
 * public UI only surfaces ACTIVE companies. Joining is allowed regardless of the
 * company's current busy state (harmless, and avoids a race with auto-reopen).
 */
export async function join(
  companySlug: string,
  payload: ApiWaitlistPayload,
): Promise<ApiWaitlistEntry> {
  const company = await prisma.company.findFirst({
    where: { slug: companySlug, status: CompanyStatus.ACTIVE },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company");

  const row = await prisma.waitlistEntry.create({
    data: {
      companyId: company.id,
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      service: payload.service?.trim() || null,
      note: payload.note?.trim() || null,
      status: WaitlistStatus.WAITING,
    },
    include: waitlistInclude,
  });
  return serializeWaitlistEntry(row);
}

/**
 * Public: look up a customer's own waiting-list entry by id, gated by the phone
 * they joined with (the only shared secret a waitlist join has — matches the
 * legacy phone-fallback already accepted for leads). A missing id and a phone
 * mismatch throw the SAME 404 — never reveal which ids exist.
 */
export async function trackByIdAndPhone(
  id: string,
  phone: string,
): Promise<ApiWaitlistEntry> {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id },
    include: waitlistInclude,
  });
  if (!entry || phoneTail(entry.phone) !== phoneTail(phone)) {
    throw new NotFoundError("Waitlist entry");
  }
  return serializeWaitlistEntry(entry);
}

export interface WaitlistListQuery {
  page?: number;
  pageSize?: number;
  status?: ApiWaitlistStatus;
  search?: string; // matches name / phone / service
  companyId?: string;
}

function searchWhere(search?: string): Prisma.WaitlistEntryWhereInput {
  const s = search?.trim();
  if (!s) return {};
  return {
    OR: [
      { name: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { service: { contains: s, mode: "insensitive" } },
    ],
  };
}

/** Provider/admin: paginated waiting list for one company (newest first). */
export async function listByCompany(
  companyId: string,
  query: WaitlistListQuery = {},
): Promise<ApiPage<ApiWaitlistEntry>> {
  const where: Prisma.WaitlistEntryWhereInput = {
    companyId,
    ...(query.status ? { status: query.status as WaitlistStatus } : {}),
    ...searchWhere(query.search),
  };
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.waitlistEntry.count({ where }),
    prisma.waitlistEntry.findMany({
      where,
      include: waitlistInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serializeWaitlistEntry), meta: { total, page, pageSize } };
}

/**
 * Admin: paginated waiting list across EVERY company (newest first), optionally
 * narrowed to one company. Mirrors listByCompany but companyId is a filter rather
 * than a hard requirement — backs the admin Leads tab's merged lead/waitlist view.
 */
export async function listAll(
  query: WaitlistListQuery = {},
): Promise<ApiPage<ApiWaitlistEntry>> {
  const where: Prisma.WaitlistEntryWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { status: query.status as WaitlistStatus } : {}),
    ...searchWhere(query.search),
  };
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.waitlistEntry.count({ where }),
    prisma.waitlistEntry.findMany({
      where,
      include: waitlistInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serializeWaitlistEntry), meta: { total, page, pageSize } };
}

// Ensures the entry exists AND belongs to the given company before mutating, so a
// provider/admin can never touch another company's waiting list by guessing an id.
async function ownedEntry(companyId: string, entryId: string): Promise<string> {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, companyId },
    select: { id: true },
  });
  if (!entry) throw new NotFoundError("Waitlist entry");
  return entry.id;
}

/**
 * Provider/admin: "accept" a waitlisted request. Fully converts the entry into a
 * normal Lead via leadsService.createLeadRecord — the SAME creation path used by a
 * direct customer submission — so the result enters the real CRM pipeline (status
 * NEW, a refNumber, a chat thread, notifications, dashboard stats, everything).
 * The entry never collected district/budget (a waitlist join only asks for
 * name/phone/service/note), so those two required Lead fields get a placeholder;
 * everything the entry DID collect is carried over verbatim.
 *
 * Idempotent: a waitlist entry can only ever be converted once. If it already has
 * a convertedLeadId (e.g. a retried request, or CONVERTED being re-selected in the
 * status dropdown), the existing Lead is returned instead of creating another one
 * — this is what "no duplicate records" requires.
 */
export async function convertToLead(companyId: string, entryId: string): Promise<ApiLead> {
  const entry = await prisma.waitlistEntry.findFirst({ where: { id: entryId, companyId } });
  if (!entry) throw new NotFoundError("Waitlist entry");

  if (entry.convertedLeadId) {
    const existing = await leadsService.getById(entry.convertedLeadId);
    if (existing) return existing;
  }

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { id: true, name: true, email: true, whatsapp: true, telegramChatId: true },
  });

  const lead = await leadsService.createLeadRecord({
    company,
    service: entry.service?.trim() || "Not specified",
    customerName: entry.name,
    phone: entry.phone,
    district: "Not specified",
    budget: "Not specified",
    description: entry.note?.trim()
      ? entry.note.trim()
      : `Accepted from the waiting list${entry.service ? ` (waiting for: ${entry.service})` : ""}.`,
  });

  await prisma.waitlistEntry.update({
    where: { id: entryId },
    data: { status: WaitlistStatus.CONVERTED, convertedLeadId: lead.id },
  });

  return lead;
}

/** Provider/admin: move an entry through the waitlist lifecycle. */
export async function setStatus(
  companyId: string,
  entryId: string,
  status: ApiWaitlistStatus,
): Promise<ApiWaitlistEntry> {
  await ownedEntry(companyId, entryId);

  if (status === "CONVERTED") {
    // Special-cased: converting is more than a status flip, see convertToLead.
    await convertToLead(companyId, entryId);
  } else {
    await prisma.waitlistEntry.update({
      where: { id: entryId },
      data: { status: status as WaitlistStatus },
    });
  }

  const row = await prisma.waitlistEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: waitlistInclude,
  });
  return serializeWaitlistEntry(row);
}

/** Provider/admin: remove an entry from the waiting list. */
export async function remove(companyId: string, entryId: string): Promise<void> {
  await ownedEntry(companyId, entryId);
  await prisma.waitlistEntry.delete({ where: { id: entryId } });
}
