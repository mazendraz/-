// Staff-facing notification center: the persisted counterpart of every push a
// PROVIDER or ADMIN receives. The staff mirror of
// notifications.customer.service.ts — read that file first; the contracts here
// are deliberately identical so the two centers stay comprehensible together.
//
// ── What this replaces ─────────────────────────────────────────────────────
// GET /api/admin/notifications derived its feed from `recentActivity()` and
// carried a comment explaining why: a real feed "would need a new Notification
// table — a real `prisma migrate dev` migration", which that environment could
// not run. The consequences were a bell with no read state (every reload
// resurfaced everything), no history past the lookback window, and nothing at
// all for the Business App. The StaffNotification table closes all three.
//
// ── Where rows are written ─────────────────────────────────────────────────
// NOT here, and not at the five services that notify. `record()` below is
// called by push.service.ts's three fan-out functions, which is where transport
// already fans out for exactly the same stated reason. One place means the
// in-app list can never disagree with what was actually pushed.
import { prisma } from "@/lib/prisma";
import { StaffNotificationType } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/utils/errors";
import { serializeStaffNotification } from "@/lib/utils/serialize";
import type { ApiStaffNotificationsResponse } from "@/lib/apiTypes";

// Newest-first cap, same value and same reasoning as the customer list: this
// backs a bell dropdown and a screen, neither of which pages, and mark-all-read
// is the clear affordance rather than delete.
const LIST_LIMIT = 50;

export interface RecordStaffNotificationInput {
  type: StaffNotificationType;
  title: string;
  body: string;
  /** Relative path to open on tap — the same `url` the push payload carries. */
  url?: string;
}

/**
 * Write one row per recipient. Never throws: a lead, chat message or approval
 * must never fail because the notification record did — the same fail-open
 * contract every other notify* function in this codebase holds.
 *
 * `userIds` rather than one id because two of the three callers fan out to a
 * set (every provider at a company, every active admin) and a single
 * createMany is one round trip instead of N.
 */
export async function record(
  userIds: readonly string[],
  input: RecordStaffNotificationInput,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await prisma.staffNotification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url ?? null,
      })),
    });
  } catch (err) {
    console.error(`[notify] failed to record staff notification for ${userIds.length} user(s):`, err);
  }
}

/** The signed-in staff member's own notifications, newest first, plus unread count. */
export async function listNotifications(userId: string): Promise<ApiStaffNotificationsResponse> {
  const [rows, unreadCount] = await Promise.all([
    prisma.staffNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.staffNotification.count({ where: { userId, read: false } }),
  ]);
  return { notifications: rows.map(serializeStaffNotification), unreadCount };
}

/** Unread count alone — backs the bell badge, which polls far more often than
 *  the list is opened and has no use for 50 rows of body text. */
export async function unreadCount(userId: string): Promise<number> {
  return prisma.staffNotification.count({ where: { userId, read: false } });
}

/**
 * Mark one notification read.
 *
 * Scoped by userId in the WHERE, not checked after the fact: an id belonging to
 * another staff member matches zero rows and 404s, so this is the ownership
 * gate as well as the update. Same shape as the customer service's markRead —
 * see api/src/lib/middleware/withRole.ts assertOwnership for why staff routes
 * never rely on the id alone.
 */
export async function markRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.staffNotification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
  if (count === 0) throw new NotFoundError("Notification");
}

/** Mark every unread notification read — the bell's "mark all read" action. */
export async function markAllRead(userId: string): Promise<void> {
  await prisma.staffNotification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}
