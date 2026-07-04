/**
 * Web Push subscription helpers for the dashboards. Registers the service worker,
 * asks for notification permission, and syncs the browser PushSubscription with the
 * backend (POST /push/subscribe · /push/unsubscribe). The server's VAPID public key
 * is fetched from GET /push/public-key (null when push isn't configured server-side).
 *
 * All functions are safe to call in unsupported browsers — they return a clear
 * status instead of throwing.
 */
import { apiGet, apiPost, isApiConfigured } from "./api";

export type PushState =
  | "unsupported" // browser lacks Push/SW/Notification APIs
  | "unconfigured" // server has no VAPID keys
  | "denied" // user blocked notifications
  | "subscribed"
  | "unsubscribed";

/** True when this browser supports the APIs Web Push needs. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** VAPID public key (base64url) → Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function fetchPublicKey(): Promise<string | null> {
  if (!isApiConfigured()) return null;
  try {
    const { publicKey } = await apiGet<{ publicKey: string | null }>("/push/public-key");
    return publicKey;
  } catch {
    return null;
  }
}

/** Current state without prompting — for rendering the toggle on mount. */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const publicKey = await fetchPublicKey();
  if (!publicKey) return "unconfigured";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "subscribed" : "unsubscribed";
  } catch {
    return "unsubscribed";
  }
}

/**
 * Prompt + subscribe this device, then persist it on the server. Resolves to the
 * resulting state ("subscribed" on success, "denied" if the user blocks).
 */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";

  const publicKey = await fetchPublicKey();
  if (!publicKey) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "unsubscribed";

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await apiPost("/push/subscribe", sub.toJSON());
  return "subscribed";
}

/** Unsubscribe this device locally and on the server. */
export async function disablePush(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await apiPost("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* best-effort */
  }
  return "unsubscribed";
}
