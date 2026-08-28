// Customer-facing notification center: the persisted counterpart of every
// push a customer receives, plus the marketing opt-out that gates one
// category of it. See the 2026-08-24 notifications blueprint — this is
// "phase 2", the storage layer phase 1's raw expoPush.notifyCustomerDevices
// calls were missing.
//
// notifyCustomer() below is now the ONLY place that pushes to a customer's
// devices (leads.service, leadCompletion.service, waitlist.service, and
// chat.service all route through it) — one call site means the in-app list
// and the push a customer actually received can never drift apart.
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/utils/errors";
import { serializeCustomerNotification } from "@/lib/utils/serialize";
import { notifyCustomerDevices } from "@/lib/services/expoPush.service";
import type {
  ApiCustomerNotificationPreferences,
  ApiCustomerNotificationsResponse,
} from "@/lib/apiTypes";

// Newest-first cap for the in-app list. Not paginated — a customer's own
// notification history is small by construction (their own leads/waitlist
// joins/chat replies), and the settings screen's "clear" affordance is
// mark-all-read, not delete, so this never needs to reach back past a
// screenful anyway.
const LIST_LIMIT = 50;

export interface NotifyCustomerInput {
  type: NotificationType;
  title: string;
  body: string;
  /** Relative in-app path — same shape every push payload's `url` already uses. */
  url?: string;
  /** Expo collapseId — same shape every push payload's `tag` already uses. */
  tag?: string;
}

/**
 * Write the Notification row AND push to the customer's devices. Never
 * throws — same fail-open contract as every other notify* function in this
 * codebase; a lead/waitlist/chat action must never fail because this did.
 *
 * Only MARKETING checks the opt-out (marketingPushEnabled) — order/account
 * notifications (LEAD_CREATED, LEAD_STATUS, LEAD_COMPLETED, CHAT_MESSAGE,
 * WAITLIST_NOTIFIED) are never gated by it, matching the blueprint's "silence
 * is a condition, not a category" rule: those aren't marketing, they're the
 * product working. The Notification ROW is still written either way, so a
 * customer who muted marketing pushes can still see the offer if they open
 * the notifications screen themselves.
 */
export async function notifyCustomer(customerId: string, input: NotifyCustomerInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        customerId,
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url ?? null,
      },
    });
  } catch (err) {
    console.error(`[notify] failed to record notification for customer ${customerId}:`, err);
  }

  try {
    if (input.type === NotificationType.MARKETING) {
      const customer = await prisma.customerUser.findUnique({
        where: { id: customerId },
        select: { marketingPushEnabled: true },
      });
      if (customer && !customer.marketingPushEnabled) return;
    }
    await notifyCustomerDevices(customerId, {
      title: input.title,
      body: input.body,
      url: input.url,
      tag: input.tag,
    });
  } catch (err) {
    console.error(`[notify] push failed for customer ${customerId}:`, err);
  }
}

/** The signed-in customer's own notifications, newest first, plus the unread count. */
export async function listNotifications(customerId: string): Promise<ApiCustomerNotificationsResponse> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.notification.count({ where: { customerId, read: false } }),
  ]);
  return { notifications: rows.map(serializeCustomerNotification), unreadCount };
}

/** Mark one notification read. Ownership-checked — ids from another account 404. */
export async function markRead(customerId: string, id: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { id, customerId },
    data: { read: true },
  });
  if (count === 0) throw new NotFoundError("Notification");
}

/** Mark every unread notification read — the settings screen's "clear" action. */
export async function markAllRead(customerId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { customerId, read: false },
    data: { read: true },
  });
}

export async function getPreferences(customerId: string): Promise<ApiCustomerNotificationPreferences> {
  const customer = await prisma.customerUser.findUniqueOrThrow({
    where: { id: customerId },
    select: { marketingPushEnabled: true, marketingEmailEnabled: true },
  });
  return customer;
}

export async function setPreferences(
  customerId: string,
  patch: Partial<ApiCustomerNotificationPreferences>,
): Promise<ApiCustomerNotificationPreferences> {
  const customer = await prisma.customerUser.update({
    where: { id: customerId },
    data: patch,
    select: { marketingPushEnabled: true, marketingEmailEnabled: true },
  });
  return customer;
}
