/**
 * Telegram connection helpers for the provider dashboard. The provider connects by
 * opening a single-use deep link we mint server-side (POST /provider/telegram/link);
 * whichever Telegram account opens it becomes the recipient of that company's lead
 * alerts. Status and disconnect live on /provider/telegram.
 *
 * The bot's username never reaches the browser — the server builds the whole t.me
 * URL — so there is nothing to configure on the frontend.
 */
import { apiGet, apiPost, apiDelete } from "./api";

export interface TelegramStatus {
  configured: boolean; // server has a bot token + username
  linked: boolean; // this company has a Telegram chat bound
}

/** Current connection state for the logged-in provider's company. */
export function getTelegramStatus(): Promise<TelegramStatus> {
  return apiGet<TelegramStatus>("/provider/telegram");
}

/**
 * Mint a fresh deep link. Returns null when Telegram isn't configured server-side,
 * in which case the caller should render nothing.
 */
export async function createTelegramLink(): Promise<string | null> {
  const { url } = await apiPost<{ url: string | null }>("/provider/telegram/link", {});
  return url;
}

/** Disconnect Telegram for this company; resolves to the new status. */
export async function disconnectTelegram(): Promise<TelegramStatus> {
  await apiDelete("/provider/telegram");
  return { configured: true, linked: false };
}
