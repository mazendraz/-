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
import { isDedupKeyViolation, submissionDedupKey } from "@/lib/utils/dedupKey";
import { phoneTail } from "@/lib/utils/phone";
import { isEffectivelyBusy, leadStatusFromLabel, serializeLead } from "@/lib/utils/serialize";
import {
  notifyNewLead,
  notifyAdmins,
  notifyCustomerOrderPlaced,
} from "@/lib/services/notifications.service";
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
import { notifyCustomer } from "@/lib/services/notifications.customer.service";
import { NotificationType } from "@/generated/prisma/enums";
import {
  ADMIN_CHANNEL,
  channelForCompany,
  channelForCustomer,
  publishAll,
} from "@/lib/services/realtime.service";
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
//
// Exported because waitlist.service.join applies the same guard to the same
// submission — a queued request is the same form, and the two windows drifting
// apart would mean a double-click is a duplicate on one path and not the other.
export const DEDUP_WINDOW_MS = 5 * 60_000;

// Push titles for updateStatus's customer notification, keyed by the SAME
// ApiLeadStatus labels serialize.ts already maps to/from. No entry for "New"
// (createLeadRecord's own notifyCustomerOrderPlaced/notifyCustomer
// covers that moment) or "Completed" (submitCompletion sends its own,
// more specific "confirm the final amount" push) — see updateStatus.
const STATUS_PUSH_COPY: Partial<Record<ApiLeadStatus, string>> = {
  Contacted: "تم التواصل معك بخصوص طلبك",
  "In Progress": "طلبك قيد التنفيذ الآن",
  Cancelled: "تم إلغاء طلبك",
};

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
  /**
   * Concurrency guard for the PUBLIC submit — see utils/dedupKey.ts.
   *
   * Optional, and supplied by `create` alone. The other entry point (an admin or
   * provider accepting a waiting-list entry) deliberately leaves it null: that
   * path has its own atomic claim, and a customer who submitted directly minutes
   * before joining the queue must not find the accept blocked by their own
   * earlier request.
   */
  dedupKey?: string | null;
  /**
   * The signed-in CustomerUser who owns this request, when there was one.
   *
   * Optional so the OTHER entry point into createLeadRecord — an admin
   * converting a waitlist entry — keeps working unchanged: nobody is signed in
   * as a customer there, and the request genuinely has no account behind it.
   */
  customerId?: string | null;
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
  const customerId = input.customerId ?? null;

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
          customerId,
          dedupKey: input.dedupKey ?? null,
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

      // Live fan-out, BEFORE runAfterResponse and outside it: publishing is a
      // synchronous write to an in-memory Set, and a provider watching their
      // dashboard should see the row appear now rather than after the email and
      // Telegram calls have settled.
      //
      // The CUSTOMER's own channel is in this list for the same reason it is in
      // the status-change fan-out below, and it was the one channel missing
      // here. The device that submitted already knows — but an account is one
      // account across devices, and the customer's OTHER sessions (their phone
      // while they ordered from the web, a second browser, the app in another
      // window) had no way to learn the order existed until they reloaded.
      // Verified against a live stream: creating an order from the app
      // delivered `lead` to the company and admin channels and nothing at all
      // to the customer's, so their other clients sat on a stale list.
      //
      // Null for an anonymous submission, which has no account to notify.
      publishAll(
        [
          channelForCompany(company.id),
          ADMIN_CHANNEL,
          ...(lead.customerId ? [channelForCustomer(lead.customerId)] : []),
        ],
        {
          type: "lead",
          leadId: lead.id,
          companyId: company.id,
        },
      );

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

        // Only signed-in customers have an email/device on file — a guest lead
        // (no account) has neither, so this stays null and both calls below
        // no-op via their own null/empty guards.
        const customer = customerId
          ? await prisma.customerUser
              .findUnique({ where: { id: customerId }, select: { email: true } })
              .catch((err) => {
                console.error(`[notify] customer lookup failed for lead ${serialized.refNumber}:`, err);
                return null;
              })
          : null;

        await Promise.allSettled([
          // Provider email (has customer contact details — they must act on it).
          notifyNewLead(serialized, {
            email: company.email,
            whatsapp: company.whatsapp,
            companyName: company.name,
          }),
          // Admin heads-up email (no customer PII — see notifications.service).
          notifyAdmins(serialized, company.name, admins.map((a) => a.email)),
          // Customer receipt — a signed-in account only (see the lookup above).
          notifyCustomerOrderPlaced(serialized, customer?.email ?? null, customerName, company.name),
          // Native push straight to the customer's phone (+ a Notification
          // row for the in-app list — see notifyCustomer), mirroring the
          // chat notification's own use of it — the same "reply arrived"
          // urgency applies to "your order was received".
          ...(customerId
            ? [
                notifyCustomer(customerId, {
                  type: NotificationType.LEAD_CREATED,
                  title: "تم استلام طلبك — Al Assema",
                  body: `${serialized.service} · ${serialized.refNumber}`,
                  url: `/chat/${serialized.id}`,
                  tag: `lead-${serialized.id}`,
                }),
              ]
            : []),
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
      // A dedupKey collision is a DIFFERENT event from a refNumber collision and
      // must not be retried: retrying re-hashes to the same key, burns the
      // remaining attempts, and surfaces as a generic conflict instead of the
      // message the customer needs. It means a copy of this exact request won the
      // race — the same outcome `create`'s window query reports, so it gets the
      // same wording.
      if (isDedupKeyViolation(err)) {
        throw new ConflictError(
          "We already received an identical request a moment ago. We'll be in touch shortly.",
        );
      }
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
export async function create(
  payload: CreateLeadInput,
  customerId: string | null = null,
): Promise<ApiLead> {
  const company = await prisma.company.findFirst({
    where: { slug: payload.companySlug, status: CompanyStatus.ACTIVE },
    select: {
      id: true,
      name: true,
      email: true,
      whatsapp: true,
      // Availability, for the check below. Loaded here rather than queried
      // separately so a busy company costs the same one round trip.
      busy: true,
      busyUntil: true,
      busyWindows: {
        // Only windows that can still be running. A finished one cannot make
        // anybody busy, and skipping them keeps this bounded as the table ages.
        where: { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
        select: { startsAt: true, endsAt: true },
      },
    },
  });
  // 404 for both missing and non-ACTIVE — don't reveal suspended companies.
  if (!company) throw new NotFoundError("Company");

  // ── Availability, enforced HERE and not only in the UI ─────────────────────
  // isEffectivelyBusy was previously read at serialization time only, which
  // made "busy" a display value: both clients swap the "Request Service" CTA
  // for "Join the waiting list", and a hand-made POST ignored that entirely.
  // The result was a live NEW lead — with notifications to email, push and
  // Telegram — for a provider who had told the platform they cannot take work,
  // and it routed around the waiting list that exists to manage exactly this.
  //
  // Note this sits in `create` (the PUBLIC submit) and not in createLeadRecord:
  // the other caller is waitlistService.convertToLead, where an admin or
  // provider is deliberately accepting a queued request WHILE busy. That is the
  // whole point of the queue and must keep working.
  if (isEffectivelyBusy(company, company.busyWindows)) {
    throw new ConflictError(
      "This company isn't taking new requests right now. You can join their waiting list instead.",
      { reason: ["COMPANY_BUSY"] },
    );
  }

  // A signed-in customer with an unresolved final amount settles that first —
  // see assertNoPendingVerification.
  if (customerId) await assertNoPendingVerification(customerId);

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
  //
  // This is the FIRST of two layers, and it is the one that produces a message
  // worth reading. It cannot be the only one: read-then-write leaves a window in
  // which simultaneous copies all read "nothing yet" and all insert, which is
  // what dedupKey below closes. See utils/dedupKey.ts for why both are kept.
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
    // Same fields the window query above compares, so the two layers agree.
    dedupKey: submissionDedupKey({
      companyId: company.id,
      phone: payload.phone,
      service: serviceText,
      windowMs: DEDUP_WINDOW_MS,
    }),
    company,
    service: serviceText,
    customerName: payload.name,
    phone: payload.phone,
    district: payload.district,
    budget: payload.budget,
    description: payload.description,
    resolved,
    customerId,
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
 * Refuse to start new work while this customer has a finished job whose final
 * amount they have not confirmed or disputed.
 *
 * ── Why the server has to say this, not just the app ───────────────────────
 * Both clients already replace the ENTIRE app with a price-verification gate
 * when the signed-in customer has a lead whose completion is still PENDING
 * (mobile: app/_layout.tsx; website: RootLayout.tsx). Nothing enforced it here,
 * so the gate was advisory: a patched bundle — or a plain curl with the
 * session's Bearer token — placed unlimited new requests while never resolving
 * the old one. That matters beyond tidiness, because verification is what
 * triggers recognizeCommission: a customer who never verifies is a customer
 * whose completed jobs never book revenue.
 *
 * Deliberately narrower than the client gate, which blocks even browsing. This
 * blocks only the two actions that START something new, so a customer is never
 * locked out of the very screens they need in order to clear the block.
 *
 * Exported because the waiting list is the other way in — see waitlist.join.
 */
export async function assertNoPendingVerification(customerId: string): Promise<void> {
  const pending = await prisma.lead.findFirst({
    where: {
      customerId,
      completion: { verificationStatus: LeadVerificationStatus.PENDING },
    },
    select: { id: true, refNumber: true },
  });
  if (!pending) return;

  throw new ConflictError(
    "Please confirm the final amount for your last service before sending a new request.",
    { reason: ["PENDING_VERIFICATION"], leadId: [pending.id], refNumber: [pending.refNumber] },
  );
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
 * The order state machine, as a graph of what may follow what.
 *
 * Before this existed, `updateStatus` mapped the label to an enum and wrote it —
 * no comparison against the current value at all. Every invalid transition
 * returned 200: COMPLETED back to New, CANCELLED to Completed, CANCELLED to In
 * Progress. The last two are the expensive ones, because they manufacture a
 * completed, commission-bearing job out of a request the customer called off, and
 * because COMPLETED is the status reviews.service.submitFromLead gates the
 * one-time review on.
 *
 * COMPLETED and CANCELLED are terminal for EVERYONE, admins included (product
 * decision, 2026-08-26). An admin who genuinely needs to undo one does it as a
 * data correction, not as an unlabelled status write that no audit entry
 * distinguishes from routine pipeline movement.
 *
 * COMPLETED is reachable from all three live statuses rather than IN_PROGRESS
 * alone: a provider who finishes a small job the same day it arrives, without
 * touching the dropdown first, is doing nothing wrong. Providers still cannot get
 * there through this function at all — `requireCompletion` routes them to the
 * completion form so a final amount is recorded.
 */
export const LEAD_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.IN_PROGRESS, LeadStatus.COMPLETED, LeadStatus.CANCELLED],
  [LeadStatus.CONTACTED]: [LeadStatus.IN_PROGRESS, LeadStatus.COMPLETED, LeadStatus.CANCELLED],
  [LeadStatus.IN_PROGRESS]: [LeadStatus.COMPLETED, LeadStatus.CANCELLED],
  [LeadStatus.COMPLETED]: [],
  [LeadStatus.CANCELLED]: [],
};

/**
 * Which statuses a lead may be sitting in for `target` to be a legal write.
 *
 * Includes `target` itself, so re-writing the status a lead already has is a
 * no-op success rather than a 409. That is not laxity: dashboards re-send the
 * currently-selected value routinely (waitlist.service's own comment calls out
 * "CONVERTED being re-selected in the status dropdown"), and rejecting a write
 * that changes nothing would turn a harmless UI habit into an error toast.
 */
function sourcesFor(target: LeadStatus): LeadStatus[] {
  const sources = (Object.keys(LEAD_TRANSITIONS) as LeadStatus[]).filter((from) =>
    LEAD_TRANSITIONS[from].includes(target),
  );
  return [...sources, target];
}

/**
 * The statuses a lead may be marked complete FROM — derived from the graph above
 * rather than restated, so the completion form and the status endpoint can never
 * disagree about when a job may be closed out. Read by
 * leadCompletion.service.submitCompletion.
 */
export const COMPLETABLE_FROM: readonly LeadStatus[] = (
  Object.keys(LEAD_TRANSITIONS) as LeadStatus[]
).filter((from) => LEAD_TRANSITIONS[from].includes(LeadStatus.COMPLETED));

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

  // Claim the transition rather than writing it. Two properties in one statement:
  // the `status: { in: … }` predicate enforces the state machine, and doing it as
  // a conditional updateMany means a simultaneous writer cannot slip between a
  // read and a write. The pair matters — a plain `update` guarded by a preceding
  // SELECT would still let a concurrent cancel overwrite a completion.
  const target = leadStatusFromLabel(status);
  const claimed = await prisma.lead.updateMany({
    where: { id, status: { in: sourcesFor(target) } },
    data: { status: target },
  });
  if (claimed.count === 0) {
    // Distinguish "no such lead" from "not a legal move" — they are different
    // answers and the caller acts on them differently.
    const current = await prisma.lead.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new NotFoundError("Lead");
    throw new ConflictError(
      current.status === LeadStatus.COMPLETED || current.status === LeadStatus.CANCELLED
        ? `This request is already ${current.status === LeadStatus.COMPLETED ? "completed" : "cancelled"} and can no longer change status.`
        : `A request cannot move from ${current.status} to ${target}.`,
    );
  }

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id },
    include: leadInclude,
  });

  // Live fan-out. Company + admins ALWAYS (a provider's own second device,
  // or an admin who changed it, must see the update land on the phone that
  // didn't make the change — added for the Business App mobile phase; see
  // docs/architecture/business-app/phase-4-realtime-push.md's B4. The OWNING
  // CUSTOMER only when there is one — a guest-submitted lead
  // (optionalCustomerId) has none, and there is no channel to tell. The
  // customer channel was declared on RealtimeEvent (realtime.service.ts)
  // from the start but never actually published anywhere: the customer
  // app's Requests tab and its mandatory price-verification gate both
  // listen for exactly this event to notice a change while the app is
  // already open (see the mobile client's lib/liveEvents.ts), and without
  // it neither ever fires until the next cold start. Synchronous and
  // outside runAfterResponse, same reasoning as the "lead" event on
  // creation just above: this is an in-memory Set write, not I/O, so
  // there's nothing to gain by deferring it.
  publishAll(
    [
      channelForCompany(lead.companyId),
      ADMIN_CHANNEL,
      ...(lead.customerId ? [channelForCustomer(lead.customerId)] : []),
    ],
    { type: "lead-status", leadId: lead.id },
  );

  if (lead.customerId) {
    // Push, on top of the live event above: SSE only reaches an app that's
    // already open. "Completed" is deliberately excluded — submitCompletion
    // already pushes its own, more specific "confirm the final amount"
    // message for that transition, and sending both would be two pushes for
    // one event. "New" is excluded too: notifyCustomerOrderPlaced already
    // covers the moment a lead is created, and this function is never the
    // path that creates one.
    const pushCopy = STATUS_PUSH_COPY[status];
    if (pushCopy) {
      runAfterResponse(() =>
        notifyCustomer(lead.customerId!, {
          type: NotificationType.LEAD_STATUS,
          title: pushCopy,
          body: `${lead.service} · ${lead.refNumber}`,
          url: "/requests",
          tag: `lead-status-${lead.id}`,
        }),
      );
    }
  }

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
