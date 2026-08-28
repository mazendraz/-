/**
 * Native push, via Expo.
 *
 * Web Push (push.service) reaches a browser. This reaches a PHONE — Expo's HTTP
 * API fans a single token out to APNs on iOS and FCM on Android, so the backend
 * needs neither an Apple key nor a Firebase service account to send.
 *
 * Same fail-open contract as every other notification path here: a missing
 * config, a dead token, or an outage never throws. A lead is created because a
 * customer asked for one, not because we managed to tell anybody about it.
 */
import { prisma } from "@/lib/prisma";
import type { PushPayload } from "@/lib/services/push.service";

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

// Expo caps a request at 100 messages. Larger sends are chunked rather than
// truncated — "we notified the first hundred providers" is not a behaviour
// anyone would choose deliberately.
const CHUNK = 100;

/**
 * Expo accepts unauthenticated sends, but an access token ties them to the
 * project and is what makes rate limits and delivery receipts attributable.
 * Optional so a dev machine works without one.
 */
function accessToken(): string | undefined {
  return process.env.EXPO_ACCESS_TOKEN || undefined;
}

/** Shape Expo returns per message. `details.error` is the actionable part. */
interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Send to a set of Expo tokens. Returns how many were accepted.
 *
 * Pruning is driven by `DeviceNotRegistered`, which is Expo's way of saying the
 * app was uninstalled or the token was replaced. Without acting on it the table
 * accumulates dead rows forever and every future send wastes a slot on them —
 * the native equivalent of the 404/410 pruning the Web Push path already does.
 */
async function sendToTokens(tokens: string[], payload: PushPayload): Promise<number> {
  if (tokens.length === 0) return 0;

  let sent = 0;
  const dead: string[] = [];

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const messages = chunk.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      // The app reads this on tap to open the right screen — the native
      // counterpart of the service worker's notificationclick URL.
      data: payload.url ? { url: payload.url } : undefined,
      sound: "default",
      // No per-account unread count to reconcile against (no Notification/
      // read-state table yet), so this is deliberately a fixed "something's
      // waiting" flag rather than an accumulating count — the client resets
      // it to 0 on foreground (see mobile's lib/push.ts), so a burst of
      // pushes before the app is reopened still just shows "1", not N.
      badge: 1,
      // Collapses repeats about the same lead into one entry, matching the
      // `tag` the web notification uses.
      ...(payload.tag ? { collapseId: payload.tag } : {}),
    }));

    try {
      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken() ? { Authorization: `Bearer ${accessToken()}` } : {}),
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.error(`[expo-push] send failed: ${res.status} ${await res.text()}`);
        continue;
      }

      const { data } = (await res.json()) as { data?: ExpoTicket[] };
      (data ?? []).forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          sent += 1;
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          dead.push(chunk[idx]!);
        } else {
          console.error(`[expo-push] ticket error: ${ticket.details?.error ?? ticket.message}`);
        }
      });
    } catch (err) {
      // Network failure to Expo. Logged, never thrown.
      console.error("[expo-push] request failed:", err);
    }
  }

  if (dead.length > 0) {
    await prisma.pushDevice
      .deleteMany({ where: { token: { in: dead } } })
      .catch((err) => console.error("[expo-push] failed to prune dead tokens:", err));
  }

  return sent;
}

async function tokensWhere(where: Record<string, unknown>): Promise<string[]> {
  const rows = await prisma.pushDevice.findMany({ where, select: { token: true } });
  return rows.map((r) => r.token);
}

/** Native push to one staff user's devices. Never throws. */
export async function notifyUserDevices(
  userId: string,
  payload: PushPayload,
): Promise<number> {
  try {
    return await sendToTokens(await tokensWhere({ userId }), payload);
  } catch (err) {
    console.error(`[expo-push] notifyUserDevices failed for ${userId}:`, err);
    return 0;
  }
}

/** Native push to every active provider of a company. Never throws. */
export async function notifyCompanyProviderDevices(
  companyId: string,
  payload: PushPayload,
): Promise<number> {
  try {
    return await sendToTokens(
      await tokensWhere({ user: { companyId, isActive: true } }),
      payload,
    );
  } catch (err) {
    console.error(`[expo-push] notifyCompanyProviderDevices failed for ${companyId}:`, err);
    return 0;
  }
}

/** Native push to every active admin. Never throws. */
export async function notifyAdminDevices(payload: PushPayload): Promise<number> {
  try {
    return await sendToTokens(
      await tokensWhere({ user: { role: "ADMIN", isActive: true } }),
      payload,
    );
  } catch (err) {
    console.error("[expo-push] notifyAdminDevices failed:", err);
    return 0;
  }
}

/**
 * Native push to a CUSTOMER's devices. Never throws.
 *
 * No Web Push counterpart on purpose: the browser side of the customer
 * experience has no subscription flow, and this is the first time reaching a
 * customer directly has been possible at all — it needed accounts to exist.
 */
export async function notifyCustomerDevices(
  customerId: string,
  payload: PushPayload,
): Promise<number> {
  try {
    return await sendToTokens(
      await tokensWhere({ customerId, customer: { isActive: true } }),
      payload,
    );
  } catch (err) {
    console.error(`[expo-push] notifyCustomerDevices failed for ${customerId}:`, err);
    return 0;
  }
}

/**
 * Register (or refresh) a device token.
 *
 * An upsert on the token, not an insert: the same token reappears on every app
 * launch, and it can move between accounts on a shared phone — signing out and
 * signing in as someone else must re-point the row, not leave the previous
 * owner receiving notifications on a device they no longer control.
 */
export async function registerDevice(input: {
  token: string;
  platform: string;
  deviceName?: string;
  userId?: string;
  customerId?: string;
}): Promise<void> {
  const owner = {
    userId: input.userId ?? null,
    customerId: input.customerId ?? null,
  };
  await prisma.pushDevice.upsert({
    where: { token: input.token },
    create: {
      token: input.token,
      platform: input.platform,
      deviceName: input.deviceName?.slice(0, 80) || null,
      ...owner,
    },
    update: {
      platform: input.platform,
      deviceName: input.deviceName?.slice(0, 80) || null,
      lastSeenAt: new Date(),
      ...owner,
    },
  });
}

/** Forget a device — what an app calls on sign-out. Idempotent. */
export async function unregisterDevice(token: string): Promise<void> {
  await prisma.pushDevice.deleteMany({ where: { token } });
}
