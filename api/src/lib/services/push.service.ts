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

export interface PushPayload {
  title: string;
  body: string;
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

/** Push to all of a user's devices. Never throws. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
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
}

/** Push to every active provider linked to a company. Never throws. */
export async function notifyCompanyProviders(
  companyId: string,
  payload: PushPayload,
): Promise<number> {
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
}

/** Push to every active admin. Never throws. */
export async function notifyAdmins(payload: PushPayload): Promise<number> {
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
}
