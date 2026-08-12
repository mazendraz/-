/**
 * Telegram connection helpers, shared by the provider dashboard and the admin
 * settings page. Whoever connects opens a single-use deep link we mint
 * server-side (POST /{scope}/telegram/link); whichever Telegram account opens it
 * becomes the recipient of that company's (provider) or that admin's (admin)
 * alerts. Status and disconnect live on GET/DELETE /{scope}/telegram.
 *
 * The bot's username never reaches the browser — the server builds the whole t.me
 * URL — so there is nothing to configure on the frontend.
 */
import { apiGet, apiPost, apiDelete } from "./api";

export type TelegramScope = "provider" | "admin";

/** One linked Telegram account. Provider scope only — an admin links just themselves. */
export interface TelegramChat {
  id: string;
  label: string | null;
  linkedAt: string;
}

export interface TelegramStatus {
  configured: boolean; // server has a bot token + username
  linked: boolean; // this company/admin has at least one Telegram chat bound
  /**
   * Provider scope: every linked account, so they can be listed and removed one by
   * one. Absent on the admin endpoint, which is single-account by design.
   */
  chats?: TelegramChat[];
  /** Provider scope: how many accounts one company may link. */
  max?: number;
}

function basePath(scope: TelegramScope): string {
  return scope === "admin" ? "/admin/telegram" : "/provider/telegram";
}

/** Current connection state for the logged-in caller (their company, or, for an admin, their own account). */
export function getTelegramStatus(scope: TelegramScope = "provider"): Promise<TelegramStatus> {
  return apiGet<TelegramStatus>(basePath(scope));
}

/**
 * Mint a fresh deep link. Returns null when Telegram isn't configured server-side,
 * in which case the caller should render nothing.
 */
export async function createTelegramLink(scope: TelegramScope = "provider"): Promise<string | null> {
  const { url } = await apiPost<{ url: string | null }>(`${basePath(scope)}/link`, {});
  return url;
}

/**
 * Disconnect Telegram for the caller. With `chatId` (a row id from status.chats)
 * only that one account is removed; without it, all of them. Re-reads the status
 * afterwards rather than assuming the result — with several accounts, removing one
 * usually leaves the company still linked.
 */
export async function disconnectTelegram(
  scope: TelegramScope = "provider",
  chatId?: string,
): Promise<TelegramStatus> {
  await apiDelete(`${basePath(scope)}${chatId ? `?id=${encodeURIComponent(chatId)}` : ""}`);
  return getTelegramStatus(scope);
}
