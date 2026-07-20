// Waiting-list business logic. Public visitors join a busy company's list (resolved
// by slug); providers manage their own company's list; admins manage any company's.
// Contact is off-platform (phone), matching the lead-generation model — mirrors the
// structure of feedback.service.ts.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CompanyStatus, WaitlistStatus } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/utils/errors";
import { serializeWaitlistEntry } from "@/lib/utils/serialize";
import type {
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

export interface WaitlistListQuery {
  page?: number;
  pageSize?: number;
  status?: ApiWaitlistStatus;
  search?: string; // matches name / phone / service
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
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
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

/** Provider/admin: move an entry through the waitlist lifecycle. */
export async function setStatus(
  companyId: string,
  entryId: string,
  status: ApiWaitlistStatus,
): Promise<ApiWaitlistEntry> {
  await ownedEntry(companyId, entryId);
  const row = await prisma.waitlistEntry.update({
    where: { id: entryId },
    data: { status: status as WaitlistStatus },
    include: waitlistInclude,
  });
  return serializeWaitlistEntry(row);
}

/** Provider/admin: remove an entry from the waiting list. */
export async function remove(companyId: string, entryId: string): Promise<void> {
  await ownedEntry(companyId, entryId);
  await prisma.waitlistEntry.delete({ where: { id: entryId } });
}
