// Web Push notifications. Sends VAPID-signed, encrypted pushes to subscribed
// provider/admin devices so they're alerted to new leads even with the dashboard
// closed. Designed to FAIL OPEN like the email path (notifications.service): a
// missing key, no subscriptions, or a send error never throws — lead creation must
// never break because of notifications.
//
// `web-push` runs only on the Node runtime (it uses node:crypto). Routes/services
// that call this must not run on the Edge runtime.
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "@/lib/prisma";
import {
  notifyAdminDevices,
  notifyCompanyProviderDevices,
  notifyUserDevices,
} from "@/lib/services/expoPush.service";
import { StaffNotificationType } from "@/generated/prisma/enums";
import { record as recordStaffNotification } from "@/lib/services/notifications.staff.service";

export interface PushPayload {
  title: string;
  body: string;
  /**
   * Notification-center category for the persisted row (see
   * notifications.staff.service.ts). Optional so no existing call site had to
   * change to keep working; omitting it records the notification as SYSTEM,
   * which is accurate for anything that hasn't declared a better category
   * rather than a silent miscategorisation.
   */
  type?: StaffNotificationType;
  /** Relative path the SW opens on click (e.g. "/provider" or "/admin"). */
  url?: string;
  tag?: string;
}

/** True only when all three VAPID values are configured. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

/** The public key the frontend needs to create a subscription, or null. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

interface StoredSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send `payload` to every given subscription. Returns the count actually
 * delivered. A 404/410 means the subscription is permanently gone, so we prune it.
 * Never throws.
 */
async function sendToSubs(subs: StoredSub[], payload: PushPayload): Promise<number> {
  if (!ensureVapid() || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) => {
      const subscription: WebPushSubscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      return webpush.sendNotification(subscription, body);
    }),
  );

  const deadEndpoints: string[] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent += 1;
    } else {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        deadEndpoints.push(subs[i].endpoint);
      } else {
        console.error(`[push] send failed (${code ?? "?"}):`, r.reason);
      }
    }
  });

  if (deadEndpoints.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint: { in: deadEndpoints } } })
      .catch((err) => console.error("[push] failed to prune dead subscriptions:", err));
  }

  return sent;
}

// ── Notification-center persistence ────────────────────────────────────────
// Rows are written HERE, in the same three fan-outs that already own transport,
// for the reason this module's own comment gives above: five services notify,
// and adding a second thing to remember in five places is how the in-app list
// and the push that was actually sent drift apart. See
// notifications.staff.service.ts's header for the rest of the rationale.
//
// Deliberately awaited rather than fired alongside the pushes: `record()` never
// throws (it swallows and logs, like every notify* path here), and awaiting it
// means a caller that immediately reads the list back — a test, or a client
// refetching on the SSE event this push accompanies — sees the row.

function toRecordInput(payload: PushPayload) {
  return {
    type: payload.type ?? StaffNotificationType.SYSTEM,
    title: payload.title,
    body: payload.body,
    url: payload.url,
  };
}

/**
 * Resolve a recipient set to user ids and record one row each.
 *
 * The `where` mirrors the push query in the caller directly below it, so the
 * people who get a row are exactly the people who get a push — including the
 * `isActive` filter, which matters: a deactivated account must not accumulate a
 * notification history it could see if it were ever reactivated.
 */
async function recordForRecipients(
  where: { companyId?: string; role?: "ADMIN"; isActive: boolean },
  payload: PushPayload,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({ where, select: { id: true } });
    await recordStaffNotification(users.map((u) => u.id), toRecordInput(payload));
  } catch (err) {
    // Same fail-open contract as everything else in this module.
    console.error("[notify] failed to resolve staff notification recipients:", err);
  }
}

/**
 * Push to all of a user's devices — BROWSERS and PHONES. Never throws.
 *
 * The two transports are fanned out here rather than at each call site: there
 * are five services that notify, and "someone added push to the mobile app"
 * must not become "someone has to remember to add a second call in five
 * places". A caller asks to notify a person; which devices that person happens
 * to have is this module's problem.
 *
 * Web Push is skipped without VAPID keys, native is not — they are configured
 * independently, and one being absent must not silence the other.
 */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  await recordStaffNotification([userId], toRecordInput(payload));
  const [web, native] = await Promise.all([
    (async () => {
      try {
        if (!isPushConfigured()) return 0;
        const subs = await prisma.pushSubscription.findMany({
          where: { userId },
          select: { endpoint: true, p256dh: true, auth: true },
        });
        return await sendToSubs(subs, payload);
      } catch (err) {
        console.error(`[push] notifyUser failed for ${userId}:`, err);
        return 0;
      }
    })(),
    notifyUserDevices(userId, payload),
  ]);
  return web + native;
}

/** Push to every active provider linked to a company. Never throws. */
export async function notifyCompanyProviders(
  companyId: string,
  payload: PushPayload,
): Promise<number> {
  await recordForRecipients({ companyId, isActive: true }, payload);
  const [web, native] = await Promise.all([
    (async () => {
      try {
        if (!isPushConfigured()) return 0;
        const subs = await prisma.pushSubscription.findMany({
          where: { user: { companyId, isActive: true } },
          select: { endpoint: true, p256dh: true, auth: true },
        });
        return await sendToSubs(subs, payload);
      } catch (err) {
        console.error(`[push] notifyCompanyProviders failed for ${companyId}:`, err);
        return 0;
      }
    })(),
    notifyCompanyProviderDevices(companyId, payload),
  ]);
  return web + native;
}

/** Push to every active admin. Never throws. */
export async function notifyAdmins(payload: PushPayload): Promise<number> {
  await recordForRecipients({ role: "ADMIN", isActive: true }, payload);
  const [web, native] = await Promise.all([
    (async () => {
      try {
        if (!isPushConfigured()) return 0;
        const subs = await prisma.pushSubscription.findMany({
          where: { user: { role: "ADMIN", isActive: true } },
          select: { endpoint: true, p256dh: true, auth: true },
        });
        return await sendToSubs(subs, payload);
      } catch (err) {
        console.error("[push] notifyAdmins failed:", err);
        return 0;
      }
    })(),
    notifyAdminDevices(payload),
  ]);
  return web + native;
}
