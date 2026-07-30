// One conversation per request. Customer ↔ provider, with admin oversight.
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import type { ApiPage } from "@/lib/apiTypes";
import * as audit from "@/lib/services/audit.service";

export const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** Cap on a single fetch — a thread can grow, a response should not. */
const MAX_MESSAGES = 200;

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
};

function serializeConversation(c: ConversationRow): ApiConversation {
  return {
    id: c.id,
    leadId: c.leadId,
    companyId: c.companyId,
    ...(c.lead ? { refNumber: c.lead.refNumber, customerName: c.lead.customerName } : {}),
    ...(c.company ? { companyName: c.company.name } : {}),
    lastMessageAt: c.lastMessageAt?.getTime() ?? null,
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

/** Provider: their company's threads, most recently active first. */
export async function listForCompany(companyId: string): Promise<ApiConversation[]> {
  const rows = await prisma.conversation.findMany({
    where: { companyId },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: MAX_PAGE_SIZE,
    include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
  });
  return rows.map(serializeConversation);
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
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const rawSize = Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));

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
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lead: { select: { refNumber: true, customerName: true } }, company: { select: { name: true } } },
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
    select: { id: true, closed: true },
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

  return serializeMessage(message as MessageRow, params.sender === "ADMIN" ? "admin" : "customer");
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
  conversationId: string;
  companyName: string;
  companySlug: string;
  lastMessageAt: number | null;
  /** First line of the newest message, for the list preview. */
  lastMessagePreview: string | null;
  lastMessageSender: MessageSenderValue | null;
  unread: number;
  closed: boolean;
}

/** How much of the newest message the list preview carries. */
const PREVIEW_LENGTH = 120;

/**
 * Summaries for a customer's own threads, in one round trip.
 *
 * Exists so the messages list does NOT have to open each thread to build itself:
 * a full read marks the thread as read, so listing that way would clear every
 * unread badge before the customer had seen a single message — the list would
 * destroy the very state it is trying to display.
 *
 * Caller has already verified each lead belongs to this customer.
 */
export async function getSummaries(
  leads: { id: string; refNumber: string }[],
): Promise<ApiThreadSummary[]> {
  if (leads.length === 0) return [];
  const byId = new Map(leads.map((l) => [l.id, l.refNumber]));

  const conversations = await prisma.conversation.findMany({
    where: { leadId: { in: [...byId.keys()] } },
    include: {
      company: { select: { name: true, slug: true } },
      // Newest visible message only — the list shows one line per thread.
      messages: {
        where: { hidden: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, sender: true, createdAt: true },
      },
    },
  });

  return conversations
    .map((c) => {
      const last = c.messages[0];
      return {
        refNumber: byId.get(c.leadId)!,
        conversationId: c.id,
        companyName: c.company.name,
        companySlug: c.company.slug,
        lastMessageAt: c.lastMessageAt?.getTime() ?? null,
        lastMessagePreview: last ? last.body.replace(/\s+/g, " ").slice(0, PREVIEW_LENGTH) : null,
        lastMessageSender: last ? (last.sender as MessageSenderValue) : null,
        unread: c.customerUnread,
        closed: c.closed,
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
