import { apiDelete, apiGet, apiPost } from "@alassema/mobile-shared";

export interface AdminTelegramStatus {
  /** Server can actually issue deep links (bot token + username both set). */
  configured: boolean;
  /** This admin has a Telegram chat bound to their own account. */
  linked: boolean;
}

export function fetchTelegramStatus(): Promise<AdminTelegramStatus> {
  return apiGet<AdminTelegramStatus>("/admin/telegram");
}

/** POST /admin/telegram/link — mints a single-use t.me deep link, valid 15
 *  minutes. Open it in the system browser (Linking.openURL), never in-app —
 *  Telegram's own app-switch handles the rest. */
export function createTelegramLink(): Promise<{ url: string | null }> {
  return apiPost<{ url: string | null }>("/admin/telegram/link", {});
}

export function unlinkTelegram(): Promise<AdminTelegramStatus> {
  return apiDelete<AdminTelegramStatus>("/admin/telegram");
}
