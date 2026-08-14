// Lead business logic. Public submit implemented here (Phase 4); provider/admin
// listing + status transitions land in Phase 8.
import { prisma } from "@/lib/prisma";
import {
  CompanyStatus,
  LeadStatus,
  LeadVerificationStatus,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { generateRefNumber } from "@/lib/utils/refNumber";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import { generateTrackingToken, safeEqual } from "@/lib/utils/token";
import { phoneTail } from "@/lib/utils/phone";
import { leadStatusFromLabel, serializeLead } from "@/lib/utils/serialize";
import { notifyNewLead, notifyAdmins } from "@/lib/services/notifications.service";
// Business Control Center: dedup this lead's customer into a Client row (by
// phone) — see schema.prisma's Client model comment and clients.service.ts.
// Best-effort, not transactional with the lead insert: a lost race here only
// means the client's displayed name/lastSeenAt lags by one request, never
// data loss (the lead is still linked once this resolves).
import { upsertClientForLead } from "@/lib/services/clients.service";
import {
  notifyCompanyProviders as pushCompanyProviders,
  notifyAdmins as pushAdmins,
} from "@/lib/services/push.service";
import {
  notifyAdminTelegram,
  notifyProviderTelegram,
} from "@/lib/services/telegram.service";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import { resolveItems } from "@/lib/services/leadItems.service";
import type { CreateLeadInput } from "@/lib/validation/leads";
import { runAfterResponse } from "@/lib/utils/afterResponse";
import type {
  ApiLead,
  ApiLeadStatus,
  ApiOperationsSummary,
  ApiPage,
  ApiVerificationStatus,
} from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Soft de-dup window: collapse an identical (company + phone + service) re-submit
// within this window into a 409. Blunts double-click and basic bot spam; it is NOT
// the primary defense (rate limit + CAPTCHA are) — a bot varying any field bypasses
// it, which is acceptable for a UX/noise guard.
const DEDUP_WINDOW_MS = 5 * 60_000;

// Exported so leadCompletion.service can build its own lead reads (verify,
// submitCompletion) from the exact same shape every other lead read uses —
// one definition of "what a lead's payload includes", not two that can drift.
export const leadInclude = {
  company: { select: { slug: true, name: true } },
  items: { orderBy: { id: "asc" } },
  completion: true,
} as const;

// Company fields a lead's notification fan-out needs (see createLeadRecord).
interface LeadCompanyRef {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
}

function clampPaging(query: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
} {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
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

export interface CreateLeadRecordInput {
  company: LeadCompanyRef;
  service: string;
  customerName: string;
  phone: string;
  district: string;
  budget: string;
  description: string;
  resolved?: Awaited<ReturnType<typeof resolveItems>> | null;
}

/**
 * Core lead creation: generates a unique refNumber + tracking token, sets status
 * NEW, opens the chat thread, and fans out notifications. This is the ONE place a
 * `Lead` row is ever created — every entry point (the public submit below, and
 * waitlistService.convertToLead accepting a waitlisted request) funnels through
 * here so both produce an identical CRM entity with the same downstream behavior
 * (pipeline stages, notifications, dashboard stats, chat, etc).
 */
export async function createLeadRecord(input: CreateLeadRecordInput): Promise<ApiLead> {
  const { company, service, customerName, phone, district, budget, description, resolved } = input;

  // Business Control Center: resolve (create-or-refresh) this customer's
  // Client row BEFORE the retry loop below — a refNumber collision retries
  // the lead insert, but there's no reason to re-upsert the same client on
  // every attempt. A failure here must not block lead creation (the whole
  // point of a lead is the customer's request, not the CRM record), so it's
  // caught and logged rather than thrown — the lead is simply created without
  // a clientId, exactly like leads created before this feature existed.
  const clientId = await upsertClientForLead(phone, customerName).catch((err) => {
    console.error(`[client] upsert failed for phone ending ${phone.slice(-4)}:`, err);
    return null;
  });

  // refNumber is unique; on the (extremely rare) collision, retry with a new one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const lead = await prisma.lead.create({
        data: {
          companyId: company.id,
          refNumber: generateRefNumber(),
          trackingToken: generateTrackingToken(),
          service,
          customerName,
          phone,
          district,
          budget,
          description,
          status: LeadStatus.NEW,
          clientId,
          // A thread from the start, so the customer can message as soon as the
          // request lands. Leads that predate this are handled lazily by
          // getOrCreateConversation — see chat.service.
          conversation: { create: { companyId: company.id } },
          ...(resolved
            ? {
                estimatedMin: resolved.estimatedMin,
                estimatedMax: resolved.estimatedMax,
                discountPercent: resolved.discountPercent,
                hasOnInspection: resolved.hasOnInspection,
                items: {
                  create: resolved.lines.map((l) => ({
                    offeringId: l.offeringId,
                    nameSnapshot: l.nameSnapshot,
                    tierLabel: l.tierLabel,
                    qty: l.qty,
                    pricingModel: l.pricingModel,
                    unitPriceMin: l.unitPriceMin,
                    unitPriceMax: l.unitPriceMax,
                    lineMin: l.lineMin,
                    lineMax: l.lineMax,
                  })),
                },
              }
            : {}),
        },
        include: leadInclude,
      });
      // Include the token ONLY on the creation response (stored client-side); it's
      // never surfaced in admin/provider list payloads.
      const serialized = { ...serializeLead(lead), trackingToken: lead.trackingToken ?? undefined };

      // Notifications run AFTER the response is sent (see runAfterResponse): they
      // never block or fail lead creation, and on a serverless host the function is
      // kept alive until they settle so nothing is dropped when the instance
      // freezes post-response. Each channel is individually fail-open.
      runAfterResponse(async () => {
        // Admins are sourced live from the User table so notifications track the
        // Team tab automatically (no env var to keep in sync).
        const admins = await prisma.user
          .findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })
          .catch((err) => {
            console.error(`[notify] admin lookup failed for lead ${serialized.refNumber}:`, err);
            return [] as { email: string }[];
          });

        await Promise.allSettled([
          // Provider email (has customer contact details — they must act on it).
          notifyNewLead(serialized, {
            email: company.email,
            whatsapp: company.whatsapp,
            companyName: company.name,
          }),
          // Admin heads-up email (no customer PII — see notifications.service).
          notifyAdmins(serialized, company.name, admins.map((a) => a.email)),
          // Web Push — reaches provider/admin devices even with the dashboard
          // closed. Bodies stay lean (no PII on a lockscreen); the click opens
          // the dashboard for the full record.
          pushCompanyProviders(company.id, {
            title: "New lead — Al Assema",
            body: `${serialized.service} · ${serialized.district} · ${serialized.refNumber}`,
            url: "/provider",
            tag: `lead-${serialized.id}`,
          }),
          pushAdmins({
            title: `New lead — ${company.name}`,
            body: `${serialized.service} · ${serialized.district} · ${serialized.refNumber}`,
            url: "/admin",
            tag: `lead-${serialized.id}`,
          }),
          // Telegram (free) — instant chat message to the owner/admin chat
          // (TELEGRAM_ADMIN_CHAT_ID) and to every Telegram account the provider has
          // linked (CompanyTelegramChat). Same fail-open contract: skipped silently
          // when the bot token isn't set or nobody's linked.
          notifyAdminTelegram(serialized, company.name),
          notifyProviderTelegram(serialized, company.id, company.name),
        ]);
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

/**
 * Public: create a lead. Resolves the company by slug (must be ACTIVE), rejects a
 * near-identical re-submit, then hands off to createLeadRecord for the actual
 * write. Returns the full RAW ApiLead.
 */
export async function create(payload: CreateLeadInput): Promise<ApiLead> {
  const company = await prisma.company.findFirst({
    where: { slug: payload.companySlug, status: CompanyStatus.ACTIVE },
    select: { id: true, name: true, email: true, whatsapp: true },
  });
  // 404 for both missing and non-ACTIVE — don't reveal suspended companies.
  if (!company) throw new NotFoundError("Company");

  // Resolve the selected items against the live catalogue FIRST: prices are read
  // server-side and snapshotted onto the lead, so a later price change never
  // rewrites what this customer was quoted.
  const resolved = payload.items?.length
    ? await resolveItems(company.id, payload.items)
    : null;
  // With items, Lead.service becomes their comma-joined names — the older lists,
  // emails and CSV export keep working without knowing about items at all.
  const serviceText = resolved ? resolved.serviceSummary : payload.service;

  // Reject a near-identical re-submit (double-click / retry / basic bot loop).
  const recentDuplicate = await prisma.lead.findFirst({
    where: {
      companyId: company.id,
      phone: payload.phone,
      service: serviceText,
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recentDuplicate) {
    throw new ConflictError(
      "We already received an identical request a moment ago. We'll be in touch shortly.",
    );
  }

  return createLeadRecord({
    company,
    service: serviceText,
    customerName: payload.name,
    phone: payload.phone,
    district: payload.district,
    budget: payload.budget,
    description: payload.description,
    resolved,
  });
}

export interface LeadListQuery {
  status?: ApiLeadStatus; // by label, e.g. "In Progress"
  search?: string; // matches refNumber / customerName / phone / service / district
  page?: number;
  pageSize?: number;
}

/**
 * Build a case-insensitive OR filter across the human-searchable lead fields.
 * Returns {} for an empty query so it composes cleanly into any where clause.
 * Exported for unit testing.
 */
export function leadSearchWhere(search?: string): Prisma.LeadWhereInput {
  const s = search?.trim();
  if (!s) return {};
  return {
    OR: [
      { refNumber: { contains: s, mode: "insensitive" } },
      { customerName: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { service: { contains: s, mode: "insensitive" } },
      { district: { contains: s, mode: "insensitive" } },
    ],
  };
}

export interface AdminLeadListQuery extends LeadListQuery {
  companyId?: string;
  from?: Date; // createdAt >= from
  to?: Date; // createdAt <= to
  /** Business Control Center: Price Verification / Price Discrepancies
   *  (Operations screen, filtered) — LeadCompletion.verificationStatus, NOT
   *  Lead.status. Values match the Prisma enum verbatim (no label mapping
   *  needed, unlike `status` above). */
  verificationStatus?: ApiVerificationStatus;
}

/** Provider: leads belonging to one company (filterable by status label). */
export async function listByCompany(
  companyId: string,
  query: LeadListQuery,
): Promise<ApiPage<ApiLead>> {
  const where: Prisma.LeadWhereInput = { companyId, ...leadSearchWhere(query.search) };
  if (query.status) where.status = leadStatusFromLabel(query.status);
  return listWhere(where, query);
}

/** Admin: all leads, filterable by company / status / date range. */
export async function listAll(
  query: AdminLeadListQuery,
): Promise<ApiPage<ApiLead>> {
  const where: Prisma.LeadWhereInput = { ...leadSearchWhere(query.search) };
  if (query.companyId) where.companyId = query.companyId;
  if (query.status) where.status = leadStatusFromLabel(query.status);
  if (query.verificationStatus) {
    where.completion = { verificationStatus: query.verificationStatus as LeadVerificationStatus };
  }
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  return listWhere(where, query);
}

// No SLA/deadline field exists on Lead — this is a documented query
// threshold for the Business Control Center's "Overdue Follow-ups" card
// (Operations screen), not a stored business rule. Easy to tune later;
// deliberately conservative (2 days) so the count only surfaces requests a
// human would genuinely call overdue.
const OVERDUE_FOLLOWUP_HOURS = 48;

/**
 * Business Control Center: the Operations screen's 5 KPI cards. A live
 * snapshot (not window-scoped) — see ApiOperationsSummary's field comments
 * for exactly what each count means and why.
 */
export async function operationsSummary(): Promise<ApiOperationsSummary> {
  const overdueThreshold = new Date(Date.now() - OVERDUE_FOLLOWUP_HOURS * 3_600_000);
  const [pendingRequests, activeServices, awaitingVerification, discrepancies, overdueFollowUps] =
    await Promise.all([
      prisma.lead.count({ where: { status: LeadStatus.NEW } }),
      prisma.lead.count({ where: { status: LeadStatus.IN_PROGRESS } }),
      prisma.leadCompletion.count({ where: { verificationStatus: LeadVerificationStatus.PENDING } }),
      prisma.transaction.count({
        where: { type: TransactionType.COMMISSION_INCOME, status: TransactionStatus.DISPUTED },
      }),
      prisma.lead.count({
        where: {
          status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED] },
          createdAt: { lt: overdueThreshold },
        },
      }),
    ]);
  return { pendingRequests, activeServices, awaitingVerification, discrepancies, overdueFollowUps };
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

/** A single lead by id, or null. (For internal cross-service lookups.) */
export async function getById(id: string): Promise<ApiLead | null> {
  const lead = await prisma.lead.findUnique({ where: { id }, include: leadInclude });
  return lead ? serializeLead(lead) : null;
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

/**
 * Provider (ownership-checked by caller) / Admin: update a lead's status.
 *
 * `requireCompletion` is the server-side backstop for the Service Completion
 * feature. The provider dashboard already intercepts "Completed" in its status
 * dropdowns and routes to the completion wizard instead (LeadRows.tsx,
 * LeadsTab.tsx's LeadModal) — but that guard lives entirely in the browser, so
 * a direct POST to this endpoint moved a lead to COMPLETED with no
 * LeadCompletion row: no final amount recorded, and the client's mandatory
 * verification gate (which keys off completion.verificationStatus) never fired.
 * Confirmed against a running server before this check existed.
 *
 * Only the TRANSITION into Completed is blocked. A lead that is already
 * COMPLETED stays editable — leads completed before this feature shipped have
 * no completion row and must not become unmanageable. Admins pass the flag as
 * false: there is no admin-side completion form to send them to, and this must
 * not remove a capability they already had.
 */
export async function updateStatus(
  id: string,
  status: ApiLeadStatus,
  { requireCompletion = false }: { requireCompletion?: boolean } = {},
): Promise<ApiLead> {
  if (requireCompletion && status === "Completed") {
    const existing = await prisma.lead.findUnique({
      where: { id },
      select: { status: true, completion: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundError("Lead");
    if (existing.status !== LeadStatus.COMPLETED && !existing.completion) {
      throw new ConflictError(
        "Mark this lead completed through the completion form so the final amount is recorded.",
      );
    }
  }

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
