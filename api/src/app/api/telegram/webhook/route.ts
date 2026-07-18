import type { NextRequest } from "next/server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/services/telegram.service";

export const dynamic = "force-dynamic";

// POST /api/telegram/webhook → receives updates from the Telegram Bot API. Set this
// URL as the bot's webhook and pass a secret_token; Telegram then sends that token
// on every call in the `x-telegram-bot-api-secret-token` header (see DEPLOY / the
// setWebhook step). We verify it here so nobody but Telegram can drive the bot.
//
// Returns 200 for every authenticated call — including one we ignore — so Telegram
// doesn't enter a retry storm; the actual work is fail-open inside
// handleTelegramUpdate. A caller that fails the secret check gets 403, since that is
// never real Telegram traffic and should not be silently accepted.
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // If no secret is configured, refuse to process (prevents an unauthenticated bot
  // takeover when the env var was forgotten).
  if (!secret) {
    console.error("[telegram] TELEGRAM_WEBHOOK_SECRET not set — ignoring webhook call");
    return new Response("ok", { status: 200 });
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (update) await handleTelegramUpdate(update);

  return new Response("ok", { status: 200 });
}
