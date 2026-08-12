// One conversation per request. Customer ↔ provider, with admin oversight.
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type { AuthUser } from "@/lib/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import type { ApiPage } from "@/lib/apiTypes";
import * as audit from "@/lib/services/audit.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";
import { notifyCompanyProviders, notifyAdmins as pushAdmins } from "@/lib/services/push.service";
import {
  buildChatTelegramMessage,
  notifyAdminChatTelegram,
  notifyProviderChatTelegram,
} from "@/lib/services/telegram.service";
import { isAdminChatNotifyEnabled } from "@/lib/services/settings.service";

export const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** Cap on a single fetch — a thread can grow, a response should not. */
const MAX_MESSAGES = 200;
/** How much of the newest message a thread-list subtitle carries. */
const PREVIEW_LENGTH = 120;

function preview(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, PREVIEW_LENGTH);
}

/** The single newest VISIBLE message per conversation — a list-row subtitle,
 *  never the full thread. Hidden (moderated) messages never leak into a
 *  preview: hiding one from the customer/provider then showing its text as
 *  the list's subtitle would defeat the point of hiding it. */
const LAST_MESSAGE_INCLUDE = {
  messages: {
    where: { hidden: false },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { body: true, sender: true, createdAt: true },
  },
} satisfies Record<string, unknown>;

export type MessageSenderValue = "CUSTOMER" | "PROVIDER" | "ADMIN";
export type Viewer = "customer" | "provider" | "admin";

export interface ApiMessage {
  id: string;
  sender: MessageSenderValue;
  body: string;
  attachment: string | null;
  /** Only ever true in an admin payload — the others never receive hidden rows. */
  hidden?: boolean;
  createdAt: number;
}

export interface ApiConversation {
  id: string;
  leadId: string;
  companyId: string;
  refNumber?: string;
  companyName?: string;
  customerName?: string;
  lastMessageAt: number | null;
  /**
   * First line of the newest visible message — the WhatsApp-style subtitle a
   * thread list shows instead of just a name and a reference number. Undefined
   * when the caller didn't ask for it (only the LIST endpoints load it; the
   * single-thread GET has the real messages array and needs no summary of it).
   */
  lastMessagePreview?: string | null;
  lastMessageSender?: MessageSenderValue | null;
  customerUnread: number;
  providerUnread: number;
  closed: boolean;
  createdAt: number;
}

type MessageRow = {
  id: string; sender: MessageSenderValue; body: string;
  attachment: string | null; hidden: boolean; createdAt: Date;
};

function serializeMessage(m: MessageRow, viewer: Viewer): ApiMessage {
  return {
    id: m.id,
    sender: m.sender,
    body: m.body,
    attachment: m.attachment,
    // Only the admin view carries the flag; for the others the row is filtered
    // out entirely, so exposing the field would just invite confusion.
    ...(viewer === "admin" ? { hidden: m.hidden } : {}),
    createdAt: m.createdAt.getTime(),
  };
}

type ConversationRow = {
  id: string; leadId: string; companyId: string;
  lastMessageAt: Date | null; customerUnread: number; providerUnread: number;
  closed: boolean; createdAt: Date;
  lead?: { refNumber: string; customerName: string } | null;
  company?: { name: string } | null;
  // Present only when the caller included LAST_MESSAGE_INCLUDE — the single-
  // thread GET has no use for it (it already has the real messages array).
  messages?: { body: string; sender: MessageSenderValue; createdAt: Date }[];
};

function serializeConversation(c: ConversationRow): ApiConversation {
  const last = c.messages?.[0];
  return {
    id: c.id,
    leadId: c.leadId,
    companyId: c.companyId,
    ...(c.lead ? { refNumber: c.lead.refNumber, customerName: c.lead.customerName } : {}),
    ...(c.company ? { companyName: c.company.name } : {}),
    lastMessageAt: c.lastMessageAt?.getTime() ?? null,
    // Only emitted when `messages` was actually loaded — an absent field reads
    // as "not asked for", never as "no message yet" (that case is `null`).
    ...(c.messages
      ? { lastMessagePreview: last ? preview(last.body) : null, lastMessageSender: last?.sender ?? null }
      : {}),
    customerUnread: c.customerUnread,
    providerUnread: c.providerUnread,
    closed: c.closed,
    createdAt: c.createdAt.getTime(),
  };
}

/**
 * The conversation for a request, created on first access.
 *
 * EVERY read path goes through this. Creating threads only in leads.service
 * would leave every request that predates this feature without one — that is not
 * an edge case, it is the entire existing lead table, and each of those
 * customers would open chat and get a 404.
 *
 * Creating lazily also avoids a row for every request nobody ever messages
 * about. `leadId` is @unique, so a concurrent double-open upserts safely.
 */
export async function getOrCreateConversation(leadId: string): Promise<ConversationRow> {
  const existing = await prisma.conversation.findUnique({
    where: { leadId },
    include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
  });
  if (existing) return existing;

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { companyId: true } });
  if (!lead) throw new NotFoundError("Conversation");

  return prisma.conversation.upsert({
    where: { leadId },
    create: { leadId, companyId: lead.companyId },
    update: {},
    include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface ThreadResult {
  conversation: ApiConversation;
  messages: ApiMessage[];
}

/**
 * Messages in a thread. `after` (epoch ms) makes the poll a delta — the client
 * asks only for what it has not seen, so a quiet thread costs almost nothing.
 *
 * Hidden messages are filtered out for everyone except an admin. The row is
 * never deleted: the record of what was actually said has to survive moderation.
 */
export async function getThread(
  conversationId: string,
  viewer: Viewer,
  after?: number,
): Promise<ThreadResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
  });
  if (!conversation) throw new NotFoundError("Conversation");

  const where = {
    conversationId,
    ...(viewer === "admin" ? {} : { hidden: false }),
    ...(after ? { createdAt: { gt: new Date(after) } } : {}),
  };

  // The cap has to truncate the OLD end of a long thread, not the new one.
  //
  // `asc` + take returned the FIRST 200 messages, so opening a conversation past
  // that length showed its beginning and nothing either side had said recently.
  // A delta poll (`after`) is already walking forward from a known point, so
  // there `asc` is correct and there is nothing to drop.
  const messages = after
    ? await prisma.message.findMany({ where, orderBy: { createdAt: "asc" }, take: MAX_MESSAGES })
    : (await prisma.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_MESSAGES,
      })).reverse(); // back to oldest-first for rendering

  return {
    conversation: serializeConversation(conversation),
    messages: messages.map((m) => serializeMessage(m as MessageRow, viewer)),
  };
}

/**
 * Provider: their company's threads, most recently active first, PAGED.
 *
 * This was a bare `take: MAX_PAGE_SIZE` returning an array. A busy company past
 * 100 conversations simply could not reach the older ones from any screen —
 * nothing sent a page, and nothing on the page said there was more. Every
 * request opens a thread eagerly (see createLeadRecord), so this count tracks
 * total requests ever received: a company doing five a week crosses it inside a
 * year, and the customers on the far side of the cut can still write in.
 *
 * Same page shape as every other list endpoint, so the UI's Pagination component
 * works unchanged.
 */
export async function listForCompany(
  companyId: string,
  query: { page?: number; pageSize?: number } = {},
): Promise<ApiPage<ApiConversation>> {
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where: { companyId } }),
    prisma.conversation.findMany({
      where: { companyId },
      // Postgres defaults NULLs to sort FIRST on a DESC column — without
      // `nulls: "last"` a conversation nobody has ever messaged in
      // (lastMessageAt still null) jumped to the very top, ahead of ones with
      // real, recent activity.
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lead: { select: { refNumber: true, customerName: true } },
        company: { select: { name: true } },
        ...LAST_MESSAGE_INCLUDE,
      },
    }),
  ]);

  return { data: rows.map(serializeConversation), meta: { total, page, pageSize } };
}

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  companyId?: string;
  q?: string;
  /**
   * Only threads where a customer is still waiting to be read.
   *
   * There is no admin-side unread counter and adding one would need a migration,
   * so the admin badge is derived from the counter that already exists:
   * `providerUnread > 0` means a customer has written and the company has not
   * opened it. That is exactly the situation an admin would want to notice
   * without hunting through the list — and it needs no new state to stay true.
   */
  unreadOnly?: boolean;
}

/** Admin: every conversation, filterable by company or reference number. */
export async function listAll(query: AdminListQuery): Promise<ApiPage<ApiConversation>> {
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const q = query.q?.trim();
  const where = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.unreadOnly ? { providerUnread: { gt: 0 } } : {}),
    ...(q
      ? {
          OR: [
            { lead: { refNumber: { contains: q, mode: "insensitive" as const } } },
            { lead: { customerName: { contains: q, mode: "insensitive" as const } } },
            { company: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      // Postgres defaults NULLs to sort FIRST on a DESC column — without
      // `nulls: "last"` a conversation nobody has ever messaged in
      // (lastMessageAt still null) jumped to the very top, ahead of ones with
      // real, recent activity.
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lead: { select: { refNumber: true, customerName: true } },
        company: { select: { name: true } },
        ...LAST_MESSAGE_INCLUDE,
      },
    }),
  ]);
  return { data: rows.map(serializeConversation), meta: { total, page, pageSize } };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Post a message and update the thread's counters in one transaction.
 *
 * The unread counter for the OTHER side goes up; the sender's own is cleared,
 * because sending is proof they have read what came before.
 */
export async function postMessage(params: {
  conversationId: string;
  sender: MessageSenderValue;
  senderUserId?: string | null;
  body: string;
}): Promise<ApiMessage> {
  const body = params.body.trim();
  if (!body) throw new ValidationError("Write a message first.");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`A message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: {
      id: true,
      closed: true,
      company: { select: { id: true, name: true } },
      lead: { select: { refNumber: true, customerName: true } },
    },
  });
  if (!conversation) throw new NotFoundError("Conversation");
  if (conversation.closed) {
    throw new ValidationError("This conversation has been closed by the Al Assema team.");
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        sender: params.sender,
        senderUserId: params.senderUserId ?? null,
        body,
      },
    }),
    prisma.conversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: new Date(),
        // An ADMIN stepping in is addressed to both sides, so both get a badge.
        customerUnread:
          params.sender === "CUSTOMER" ? 0 : { increment: 1 },
        providerUnread:
          params.sender === "PROVIDER" ? 0 : { increment: 1 },
      },
    }),
  ]);

  // Debounced (see shouldNotify) so three quick messages read as one alert, not
  // three. A provider's own reply has nowhere to go — the customer has no
  // account, so no push subscription and no Telegram link exist for them.
  if (shouldNotify(params.conversationId)) {
    notifyNewMessage(conversation, params.sender, body);
  }

  return serializeMessage(message as MessageRow, params.sender === "ADMIN" ? "admin" : "customer");
}

/**
 * Push + Telegram for a just-posted message, run after the response is sent
 * (see runAfterResponse) so a slow or failing channel never delays the send
 * itself. CUSTOMER → provider + admin (the admin heads-up mirrors the lead
 * notification pattern); ADMIN stepping in → provider only; PROVIDER → nobody,
 * since the customer side has no account to hold a subscription or a link.
 */
function notifyNewMessage(
  conversation: {
    id: string;
    company: { id: string; name: string };
    lead: { refNumber: string; customerName: string } | null;
  },
  sender: MessageSenderValue,
  body: string,
): void {
  if (sender === "PROVIDER" || !conversation.lead) return;

  const senderLabel = sender === "CUSTOMER" ? "العميل" : "الإدارة";
  const text = buildChatTelegramMessage({
    refNumber: conversation.lead.refNumber,
    companyName: conversation.company.name,
    customerName: conversation.lead.customerName,
    senderLabel,
    body,
  });
  const bodyPreview = preview(body);

  runAfterResponse(async () => {
    // Admins can mute the CHAT channel specifically (see ApiAdminNotificationSettings)
    // — leads always get through regardless, this toggle only affects this path.
    const notifyAdmin = sender === "CUSTOMER" && (await isAdminChatNotifyEnabled());
    await Promise.allSettled([
      notifyCompanyProviders(conversation.company.id, {
        title: `رسالة جديدة — ${conversation.lead!.refNumber}`,
        body: bodyPreview,
        url: "/provider?tab=messages",
        tag: `chat-${conversation.id}`,
      }),
      notifyProviderChatTelegram(conversation.company.id, text),
      ...(notifyAdmin
        ? [
            pushAdmins({
              title: `رسالة جديدة — ${conversation.company.name}`,
              body: bodyPreview,
              url: "/admin?tab=chat",
              tag: `chat-${conversation.id}`,
            }),
            notifyAdminChatTelegram(text),
          ]
        : []),
    ]);
  });
}

/**
 * Clear the badge for whichever side just opened the thread.
 *
 * `updateMany` with a `> 0` guard, not `update`: a full read happens on every
 * poll of a thread that has no messages yet (the client has no `after` cursor to
 * send), so an unconditional write turned an idle open chat into one UPDATE
 * every 8 seconds, forever, to set a zero that was already zero.
 */
export async function markRead(conversationId: string, viewer: Viewer): Promise<void> {
  if (viewer === "admin") return; // admins have no unread badge of their own
  const field = viewer === "customer" ? "customerUnread" : "providerUnread";
  await prisma.conversation.updateMany({
    where: { id: conversationId, [field]: { gt: 0 } },
    data: { [field]: 0 },
  });
}

// ── Customer thread summaries ────────────────────────────────────────────────

export interface ApiThreadSummary {
  refNumber: string;
  /** Null until someone actually opens the thread — see getSummaries. */
  conversationId: string | null;
  companyName: string;
  companySlug: string;
  lastMessageAt: number | null;
  /** First line of the newest message, for the list preview. */
  lastMessagePreview: string | null;
  lastMessageSender: MessageSenderValue | null;
  unread: number;
  closed: boolean;
}

/**
 * Summaries for a customer's own threads, in one round trip.
 *
 * Exists so the messages list does NOT have to open each thread to build itself:
 * a full read marks the thread as read, so listing that way would clear every
 * unread badge before the customer had seen a single message — the list would
 * destroy the very state it is trying to display.
 *
 * ── Every LEAD gets a row, not every Conversation ────────────────────────────
 * A Conversation is created lazily, the first time anyone opens the thread (see
 * getOrCreateConversation) — a request nobody has messaged about yet has no row
 * in that table at all. Building this list by querying Conversation therefore
 * made a customer's OWN, freshly-submitted request disappear from their message
 * list entirely, with nothing to click to start the conversation the feature
 * exists for. The lead is the source of truth for "this is one of mine"; the
 * conversation, when one exists, only adds what has been said so far.
 *
 * Caller has already verified each lead belongs to this customer.
 */
export async function getSummaries(
  leads: { id: string; refNumber: string; companyId: string }[],
): Promise<ApiThreadSummary[]> {
  if (leads.length === 0) return [];

  const [conversations, companies] = await Promise.all([
    prisma.conversation.findMany({
      where: { leadId: { in: leads.map((l) => l.id) } },
      // Newest visible message only — the list shows one line per thread.
      include: LAST_MESSAGE_INCLUDE,
    }),
    // The company name/slug come from the LEAD's company, not the conversation's
    // — a lead with no conversation yet still has to show who it was sent to.
    prisma.company.findMany({
      where: { id: { in: [...new Set(leads.map((l) => l.companyId))] } },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const byLeadId = new Map(conversations.map((c) => [c.leadId, c]));
  const companyById = new Map(companies.map((c) => [c.id, c]));

  return leads
    .map((lead) => {
      const c = byLeadId.get(lead.id);
      const company = companyById.get(lead.companyId);
      const last = c?.messages[0];
      return {
        refNumber: lead.refNumber,
        // Null tells the client no thread exists yet — it opens on first send,
        // same as every other lazily-created conversation in this feature.
        conversationId: c?.id ?? null,
        companyName: company?.name ?? "",
        companySlug: company?.slug ?? "",
        lastMessageAt: c?.lastMessageAt?.getTime() ?? null,
        lastMessagePreview: last ? preview(last.body) : null,
        lastMessageSender: last ? (last.sender as MessageSenderValue) : null,
        unread: c?.customerUnread ?? 0,
        closed: c?.closed ?? false,
      };
    })
    // Most recently active first; threads with no messages yet sit at the end
    // rather than jumping the queue on their creation time.
    .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
}

/** Provider access check — a thread belongs to exactly one company. */
export async function assertProviderAccess(
  conversationId: string,
  companyId: string,
): Promise<ConversationRow> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
  });
  if (!conversation) throw new NotFoundError("Conversation");
  if (conversation.companyId !== companyId) {
    throw new ForbiddenError("This conversation belongs to another company.");
  }
  return conversation;
}

/** Admin: hide or restore a message. The row is kept either way. */
export async function setMessageHidden(
  actor: AuthUser,
  conversationId: string,
  messageId: string,
  hidden: boolean,
): Promise<ApiMessage> {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message");

  const updated = await prisma.message.update({ where: { id: messageId }, data: { hidden } });
  await audit.record(actor, {
    action: hidden ? "chat.message.hide" : "chat.message.unhide",
    entity: "Message",
    entityId: messageId,
    meta: { conversationId },
  });
  return serializeMessage(updated as MessageRow, "admin");
}

/** Admin: close or reopen a conversation. Closed threads reject new messages. */
export async function setClosed(
  actor: AuthUser,
  conversationId: string,
  closed: boolean,
): Promise<ApiConversation> {
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { closed },
    include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
  });
  await audit.record(actor, {
    action: closed ? "chat.close" : "chat.reopen",
    entity: "Conversation",
    entityId: conversationId,
    meta: { companyId: updated.companyId },
  });
  return serializeConversation(updated);
}

// ── Notification debounce ────────────────────────────────────────────────────

/**
 * At most one provider notification per conversation per minute.
 *
 * A customer typing three quick messages is one thought, not three alerts. In
 * memory on purpose: this is a nice-to-have that must never add a database
 * write to the message path, and the worst case if the process restarts is one
 * extra notification.
 */
const lastNotifiedAt = new Map<string, number>();
export const NOTIFY_DEBOUNCE_MS = 60_000;

/**
 * Entries older than the debounce window can never suppress anything again, so
 * holding them is pure growth: one permanent entry per conversation that has ever
 * been messaged in, for the lifetime of the process. Swept opportunistically on
 * write — there is no timer to own, and this path already runs on every message.
 */
function evictExpired(now: number): void {
  for (const [id, at] of lastNotifiedAt) {
    if (now - at >= NOTIFY_DEBOUNCE_MS) lastNotifiedAt.delete(id);
  }
}

export function shouldNotify(conversationId: string, now = Date.now()): boolean {
  const last = lastNotifiedAt.get(conversationId);
  if (last != null && now - last < NOTIFY_DEBOUNCE_MS) return false;
  evictExpired(now);
  lastNotifiedAt.set(conversationId, now);
  return true;
}

/** Test seam — the debounce map is process-local state. */
export function resetNotifyDebounce(): void {
  lastNotifiedAt.clear();
}
