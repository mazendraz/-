// Waiting-list business logic. Public visitors join a busy company's list (resolved
// by slug); providers manage their own company's list; admins manage any company's.
// Contact is off-platform (phone), matching the lead-generation model — mirrors the
// structure of feedback.service.ts.
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type { Prisma } from "@/generated/prisma/client";
import { CompanyStatus, WaitlistStatus, NotificationType } from "@/generated/prisma/enums";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import { serializeWaitlistEntry } from "@/lib/utils/serialize";
import { phoneTail } from "@/lib/utils/phone";
import { isDedupKeyViolation, submissionDedupKey } from "@/lib/utils/dedupKey";
import * as leadsService from "@/lib/services/leads.service";
import { resolveItems, type ResolvedRequest } from "@/lib/services/leadItems.service";
import { notifyCustomer } from "@/lib/services/notifications.customer.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";
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
 *
 * Mirrors leadsService.create step for step — resolve the basket against the live
 * catalogue, reject a near-identical re-submit, then write — because the customer
 * filled the same form and expects the same treatment. The one difference is what
 * comes out: a queued entry instead of a Lead. Everything captured here is handed
 * to createLeadRecord unchanged when the provider accepts (see convertToLead).
 */
export async function join(
  companySlug: string,
  payload: ApiWaitlistPayload,
  customerId: string | null = null,
): Promise<ApiWaitlistEntry> {
  const company = await prisma.company.findFirst({
    where: { slug: companySlug, status: CompanyStatus.ACTIVE },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company");

  // Same rule as leadsService.create: an unresolved final amount blocks starting
  // something new. Joining a queue is a slower way to start the same thing, so
  // leaving it open here would have made the check on the direct path a
  // one-click detour rather than a rule.
  //
  // Note there is deliberately NO busy check here — see the docblock above.
  // Joining the waiting list of a company that happens to be free is harmless,
  // and blocking it would invert the point of the queue.
  if (customerId) await leadsService.assertNoPendingVerification(customerId);

  // Prices are read SERVER-side and frozen onto the entry now, not on accept —
  // see WaitlistEntry.itemsSnapshot for why a later price change must not rewrite
  // what this customer was quoted while they wait.
  const resolved = payload.items?.length
    ? await resolveItems(company.id, payload.items)
    : null;
  // With items, `service` becomes their comma-joined names — the same
  // substitution leadsService.create makes for Lead.service, so the provider's
  // list, the emails and the CSV export read a real summary either way.
  const serviceText = resolved
    ? resolved.serviceSummary
    : payload.service?.trim() || null;

  // Reject a near-identical re-submit (double-click / retry / basic bot loop),
  // the same guard and window POST /leads applies. Worth more here than there:
  // a duplicate lead is visibly duplicated in the pipeline today, while a
  // duplicate queued entry sits unnoticed until someone accepts both.
  const phone = payload.phone.trim();
  const recentDuplicate = await prisma.waitlistEntry.findFirst({
    where: {
      companyId: company.id,
      phone,
      service: serviceText,
      createdAt: { gte: new Date(Date.now() - leadsService.DEDUP_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recentDuplicate) {
    throw new ConflictError(
      "We already received an identical request a moment ago. We'll be in touch shortly.",
    );
  }

  // Second layer, closing the window the query above cannot: simultaneous joins
  // all read "nothing yet" and all insert. UNIQUE on dedupKey makes the database
  // pick the winner. See utils/dedupKey.ts.
  const dedupKey = submissionDedupKey({
    companyId: company.id,
    phone,
    // The query above compares `service: serviceText`, which is nullable here —
    // an entry joined with no service named at all. Collapsed to "" so the hash
    // has something stable to fold in, matching what that comparison means.
    service: serviceText ?? "",
    windowMs: leadsService.DEDUP_WINDOW_MS,
  });

  try {
    const row = await prisma.waitlistEntry.create({
      data: {
        companyId: company.id,
        name: payload.name.trim(),
        phone,
        service: serviceText,
        dedupKey,
        note: payload.note?.trim() || null,
        district: payload.district?.trim() || null,
        budget: payload.budget?.trim() || null,
        // Spread rather than a `: null` branch — `Prisma.JsonNull` is a runtime
        // value, and `Prisma` is imported here as a type only.
        ...(resolved ? { itemsSnapshot: resolved as unknown as Prisma.InputJsonValue } : {}),
        status: WaitlistStatus.WAITING,
        // Optional, same reasoning as Lead.customerId in leads/route.ts: the
        // route stays public (an anonymous visitor may still join), and this
        // is attached only when a session happened to be present.
        customerId,
      },
      include: waitlistInclude,
    });
    return serializeWaitlistEntry(row);
  } catch (err) {
    // A simultaneous copy of this join won the race. Same outcome the window
    // query above reports, so it gets the same wording — the customer must not
    // be able to tell which of the two layers caught them.
    if (isDedupKeyViolation(err)) {
      throw new ConflictError(
        "We already received an identical request a moment ago. We'll be in touch shortly.",
      );
    }
    throw err;
  }
}

/** A signed-in customer's own waitlist joins, newest first. */
export async function listForCustomer(customerId: string): Promise<ApiWaitlistEntry[]> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { customerId },
    include: waitlistInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeWaitlistEntry);
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
 * Read back the priced basket frozen onto an entry at join time.
 *
 * The column holds a `ResolvedRequest` written whole by `join` (see
 * WaitlistEntry.itemsSnapshot), so the cast is asserting what this code itself
 * stored — not trusting a shape from outside. The `lines` check is the guard for
 * the one case that isn't that: a row written before the column existed, or by
 * hand.
 */
function readItemsSnapshot(value: unknown): ResolvedRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ResolvedRequest>;
  return Array.isArray(candidate.lines) && candidate.lines.length > 0
    ? (candidate as ResolvedRequest)
    : null;
}

/**
 * Provider/admin: "accept" a waitlisted request. Fully converts the entry into a
 * normal Lead via leadsService.createLeadRecord — the SAME creation path used by a
 * direct customer submission — so the result enters the real CRM pipeline (status
 * NEW, a refNumber, a chat thread, notifications, dashboard stats, everything).
 *
 * Every field the customer filled in is carried over verbatim, INCLUDING the
 * priced basket: the entry now collects the whole request form, so what comes out
 * of this is indistinguishable from a request sent directly on the day it was
 * submitted — same items, same estimate, same discount. That is the point of the
 * feature: waiting must cost the customer the wait, not their order.
 *
 * The "Not specified" fallbacks below are ONLY for entries joined through the old
 * short form (name/phone/service/note), which genuinely never collected a district
 * or a budget. They are the legacy path, not the normal one — a fresh entry never
 * reaches them.
 *
 * Idempotent: a waitlist entry can only ever be converted once. If it already has
 * a convertedLeadId (e.g. a retried request, or CONVERTED being re-selected in the
 * status dropdown), the existing Lead is returned instead of creating another one
 * — this is what "no duplicate records" requires.
 *
 * That idempotency is CLAIMED, not merely checked. Reading `convertedLeadId`,
 * finding it null, and then creating a Lead leaves a window in which every
 * concurrent caller reads null and every one of them creates a Lead. Because each
 * writes a DIFFERENT id back, the @unique on the column never fires: the last
 * write simply wins and the other Leads survive with nothing referencing them.
 * Measured before this claim existed: five simultaneous accepts of one entry
 * produced five real orders, five chat threads and five customer pushes, and all
 * five requests were answered 200. Four of those orders were reachable only by
 * querying the Lead table directly — the waiting list that created them had
 * forgotten they existed.
 *
 * The claim below is the same conditional-updateMany used by
 * reviews.service.submitFromLead for the one-time review slot: exactly one caller
 * matches a row and proceeds, the rest match zero and are told so.
 */
export async function convertToLead(companyId: string, entryId: string): Promise<ApiLead> {
  const entry = await prisma.waitlistEntry.findFirst({ where: { id: entryId, companyId } });
  if (!entry) throw new NotFoundError("Waitlist entry");

  if (entry.convertedLeadId) {
    const existing = await leadsService.getById(entry.convertedLeadId);
    // Still settle the status: an entry that has a Lead IS converted, and
    // returning early without this left rows stuck at WAITING with a lead
    // attached — visible in the pipeline as a request nobody had accepted.
    if (existing) {
      if (entry.status !== WaitlistStatus.CONVERTED) {
        await prisma.waitlistEntry.update({
          where: { id: entryId },
          data: { status: WaitlistStatus.CONVERTED },
        });
      }
      return existing;
    }
  }

  // ── Claim the conversion ────────────────────────────────────────────────────
  // Flipping the status to CONVERTED is what reserves this entry. The `status:
  // { not: CONVERTED }` predicate is the part that actually serializes callers
  // (the row lock does the rest); `convertedLeadId: null` re-checks, inside the
  // same atomic statement, the condition the read above tested optimistically.
  const claimed = await prisma.waitlistEntry.updateMany({
    where: {
      id: entryId,
      companyId,
      convertedLeadId: null,
      status: { not: WaitlistStatus.CONVERTED },
    },
    data: { status: WaitlistStatus.CONVERTED },
  });

  if (claimed.count === 0) {
    // Someone else got there first. Two shapes, distinguished by re-reading:
    const current = await prisma.waitlistEntry.findFirst({
      where: { id: entryId, companyId },
      select: { convertedLeadId: true },
    });
    if (current?.convertedLeadId) {
      // The winner finished — hand back THEIR lead, which is precisely the
      // idempotent answer the early-return above gives on the sequential path.
      const existing = await leadsService.getById(current.convertedLeadId);
      if (existing) return existing;
    }
    // Claimed but not yet finished: a conversion is in flight right now. There
    // is no lead to return yet, and inventing a second one is the bug this
    // whole claim exists to prevent.
    throw new ConflictError("This request is already being accepted.");
  }

  try {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, name: true, email: true, whatsapp: true },
    });

    const resolved = readItemsSnapshot(entry.itemsSnapshot);

    const lead = await leadsService.createLeadRecord({
      company,
      service: resolved?.serviceSummary || entry.service?.trim() || "Not specified",
      customerName: entry.name,
      phone: entry.phone,
      district: entry.district?.trim() || "Not specified",
      budget: entry.budget?.trim() ?? "",
      description: entry.note?.trim()
        ? entry.note.trim()
        : `Accepted from the waiting list${entry.service ? ` (waiting for: ${entry.service})` : ""}.`,
      resolved,
      // The account that placed the request, so the accepted Lead lands in the same
      // "My Requests" the customer has been watching it from, and the "we received
      // your order" push reaches their phone. Without this, accepting a request made
      // by a signed-in customer produced a lead their own account could not see.
      customerId: entry.customerId,
    });

    await prisma.waitlistEntry.update({
      where: { id: entryId },
      data: { convertedLeadId: lead.id },
    });

    return lead;
  } catch (err) {
    // Release the claim. Without this, a failure between claiming and creating
    // (the company row vanished, a pricing snapshot that no longer resolves)
    // would strand the entry at CONVERTED with no lead attached — permanently
    // unacceptable and permanently un-retryable, since every later attempt would
    // fail the claim and find no lead to return. Restoring the previous status
    // makes the accept simply retryable, which is what a provider expects after
    // an error message.
    await prisma.waitlistEntry
      .updateMany({
        where: { id: entryId, companyId, convertedLeadId: null },
        data: { status: entry.status },
      })
      .catch((releaseErr) => {
        console.error(`[waitlist] failed to release conversion claim on ${entryId}:`, releaseErr);
      });
    throw err;
  }
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

  // "Notified" is the whole point of a waiting list — a slot opened up and
  // the customer needs to know NOW, not whenever they happen to reopen the
  // app. Only reachable if they joined signed in (customerId) AND have a
  // device registered; a visitor who joined anonymously still sees the
  // status change next time they track their entry by phone, just with no
  // push. Fail-open, fire-and-forget — same contract as every other push.
  if (status === "NOTIFIED" && row.customerId) {
    runAfterResponse(() =>
      notifyCustomer(row.customerId!, {
        type: NotificationType.WAITLIST_NOTIFIED,
        title: `${row.company.name} فاضية دلوقتي`,
        body: row.service ? `دورك جه — ${row.service}` : "دورك جه في قائمة الانتظار",
        url: `/companies/${row.company.slug}`,
        tag: `waitlist-${row.id}`,
      }),
    );
  }

  return serializeWaitlistEntry(row);
}

/** Provider/admin: remove an entry from the waiting list. */
export async function remove(companyId: string, entryId: string): Promise<void> {
  await ownedEntry(companyId, entryId);
  await prisma.waitlistEntry.delete({ where: { id: entryId } });
}
