// Telegram notifications on new leads (via the Bot API — no SDK, free). Sends an
// instant chat message to every subscribed admin, and — when a provider has
// linked their Telegram — to that provider too. Designed to FAIL OPEN like the
// email / push paths (see notifications.service / push.service): a missing bot
// token, a missing chat id, or a send error never throws — lead creation must
// never break or block because of notifications.
//
// Setup: create a bot with @BotFather to get TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME.
// Admins self-link from the dashboard's "Connect Telegram" button (User.telegramChatId,
// createAdminLinkUrl/linkAdminByToken below) — the same deep-link mechanism as a
// provider's Company.telegramChatId. TELEGRAM_ADMIN_CHAT_ID is a legacy static
// fallback chat id from before self-linking existed; still honored if set.
import type { ApiLead } from "@/lib/apiTypes";
import { prisma } from "@/lib/prisma";
import { phoneTail } from "@/lib/utils/phone";

/** True only when a bot token is configured. */
export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Escape text interpolated into an HTML-parse-mode message, so a customer- or
 * admin-supplied value can never break (or inject) markup.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build the Telegram message body for a new lead (HTML parse mode). Pure —
 * unit-testable. `forAdmin` prefixes the company name so the owner knows which
 * provider the lead landed on. Values are HTML-escaped so a customer-supplied
 * field can never break the markup.
 */
export function buildLeadTelegramMessage(
  lead: ApiLead,
  companyName: string,
  forAdmin = false,
): string {
  const e = escapeHtml;
  const header = forAdmin
    ? `🔔 <b>طلب جديد على ${e(companyName)}</b>`
    : `🔔 <b>عندك طلب جديد على العاصمة</b>`;
  const lines = [
    `📄 رقم الطلب: <b>${e(lead.refNumber)}</b>`,
    `🛠️ الخدمة: ${e(lead.service)}`,
    `👤 العميل: ${e(lead.name)}`,
    `📞 التليفون: ${e(lead.phone)}`,
    `📍 المنطقة: ${e(lead.district)}`,
    // Budget and description are optional on the request form — a customer who
    // left them blank shouldn't produce a message with dangling empty lines.
    lead.budget && `💰 الميزانية: ${e(lead.budget)}`,
    lead.description && `📝 التفاصيل: ${e(lead.description)}`,
  ].filter(Boolean);
  return `${header}\n\n${lines.join("\n")}`;
}

/**
 * Send one Telegram message to a chat id, with optional extra Bot API fields (e.g.
 * reply_markup). Returns true if dispatched, false if skipped (not configured / no
 * chat id). Never throws internally to callers that already wrap it — but the
 * `notify*` helpers below catch, so this may throw on a non-2xx for the webhook.
 */
async function sendViaTelegram(
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || chatId === "" || chatId === undefined) return false;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram responded ${res.status}: ${await res.text()}`);
  }
  return true;
}

/**
 * Every chat id currently subscribed to admin Telegram alerts: the legacy static
 * TELEGRAM_ADMIN_CHAT_ID env var (if still set — kept for backward compat, one
 * admin can leave it as their catch-all without ever linking) PLUS every ADMIN
 * user who has self-linked their own Telegram from the dashboard (see
 * createAdminLinkUrl). Deduplicated so an admin who's also the env var's chat
 * never gets the same message twice.
 */
async function adminChatIds(): Promise<string[]> {
  const ids = new Set<string>();
  const envChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (envChatId) ids.add(envChatId);

  const linked = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, telegramChatId: { not: null } },
    select: { telegramChatId: true },
  });
  for (const u of linked) if (u.telegramChatId) ids.add(u.telegramChatId);

  return [...ids];
}

/**
 * Notify every subscribed admin of a new lead over Telegram (see adminChatIds).
 * Never throws; a bad chat id for one admin never blocks the others. Returns true
 * if at least one message was dispatched.
 */
export async function notifyAdminTelegram(
  lead: ApiLead,
  companyName: string,
): Promise<boolean> {
  try {
    if (!isTelegramConfigured()) {
      console.info(
        `[telegram] TELEGRAM_BOT_TOKEN not set — skipping admin Telegram for lead ${lead.refNumber}`,
      );
      return false;
    }
    const chatIds = await adminChatIds();
    if (chatIds.length === 0) {
      console.info(
        `[telegram] no admin Telegram chat linked — skipping admin Telegram for lead ${lead.refNumber}`,
      );
      return false;
    }
    const text = buildLeadTelegramMessage(lead, companyName, true);
    const results = await Promise.allSettled(chatIds.map((id) => sendViaTelegram(id, text)));
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[telegram] admin send failed for lead ${lead.refNumber} (chat ${chatIds[i]}):`, r.reason);
      }
    });
    return results.some((r) => r.status === "fulfilled" && r.value);
  } catch (err) {
    console.error(`[telegram] admin send failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/** How many Telegram accounts one company may link. */
export const MAX_COMPANY_TELEGRAM_CHATS = 5;

/**
 * Every chat id linked to a company. A company may have several (owner + staff);
 * all of them receive every alert.
 */
export async function companyChatIds(companyId: string): Promise<string[]> {
  const rows = await prisma.companyTelegramChat.findMany({
    where: { companyId },
    select: { chatId: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.chatId);
}

/**
 * Notify a provider of a new lead over Telegram, on every account they've linked.
 * Never throws, and one dead chat never blocks the others — the same fail-open
 * contract as notifyAdminTelegram. Returns true if at least one was dispatched.
 */
export async function notifyProviderTelegram(
  lead: ApiLead,
  companyId: string,
  companyName: string,
): Promise<boolean> {
  try {
    if (!isTelegramConfigured()) return false;
    const chatIds = await companyChatIds(companyId);
    if (chatIds.length === 0) return false;

    const text = buildLeadTelegramMessage(lead, companyName, false);
    const results = await Promise.allSettled(chatIds.map((id) => sendViaTelegram(id, text)));
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(
          `[telegram] provider send failed for lead ${lead.refNumber} (chat ${chatIds[i]}):`,
          r.reason,
        );
      }
    });
    return results.some((r) => r.status === "fulfilled" && r.value);
  } catch (err) {
    console.error(`[telegram] provider send failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/**
 * Build the Telegram message body for a new chat message (HTML parse mode).
 * Same builder for both the provider and the admin recipient — the admin's
 * copy just needs the company name to know which conversation it was, which
 * is already part of the text.
 */
export function buildChatTelegramMessage(params: {
  refNumber: string;
  companyName: string;
  customerName: string;
  senderLabel: string;
  body: string;
}): string {
  const e = escapeHtml;
  return (
    `💬 <b>رسالة جديدة من ${e(params.senderLabel)}</b>\n\n` +
    `📄 الطلب: <b>${e(params.refNumber)}</b> — ${e(params.companyName)}\n` +
    `👤 العميل: ${e(params.customerName)}\n\n` +
    `${e(params.body)}`
  );
}

/** Notify every subscribed admin chat of a new chat message. Never throws. */
export async function notifyAdminChatTelegram(text: string): Promise<boolean> {
  try {
    if (!isTelegramConfigured()) return false;
    const chatIds = await adminChatIds();
    if (chatIds.length === 0) return false;
    const results = await Promise.allSettled(chatIds.map((id) => sendViaTelegram(id, text)));
    return results.some((r) => r.status === "fulfilled" && r.value);
  } catch (err) {
    console.error("[telegram] admin chat send failed:", err);
    return false;
  }
}

/** Notify every chat a company has linked of a new chat message. Never throws. */
export async function notifyProviderChatTelegram(
  companyId: string,
  text: string,
): Promise<boolean> {
  try {
    if (!isTelegramConfigured()) return false;
    const chatIds = await companyChatIds(companyId);
    if (chatIds.length === 0) return false;
    const results = await Promise.allSettled(chatIds.map((id) => sendViaTelegram(id, text)));
    return results.some((r) => r.status === "fulfilled" && r.value);
  } catch (err) {
    console.error("[telegram] provider chat send failed:", err);
    return false;
  }
}

// ── Provider self-linking via the bot (webhook) ──────────────────────────────────
// Bots can't message a user first, so the provider must always make the first move.
// There are two ways in, and the first is strongly preferred:
//
//   1. Deep link (dashboard "Connect Telegram"). We mint a single-use token and
//      send them to t.me/<bot>?start=<token>. Redeeming the token proves which
//      company they are — no phone involved, so nothing to spoof or mistype.
//   2. Phone share (they found the bot on their own). They tap "share my number"
//      and we match it against Company.phone/whatsapp. Kept as a fallback.

/** Minimal shapes of the Telegram Update fields we consume. */
/** The Telegram profile of whoever sent the update. Used only to label the row. */
export interface TelegramSender {
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramUpdate {
  message?: {
    chat?: { id: number };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
    // Used only to label the stored row, so the dashboard can show a name next to
    // each linked account instead of a bare chat id.
    from?: TelegramSender;
  };
}

/** Human-readable label for a linked account, from the Telegram profile. */
function senderLabel(from: TelegramSender | undefined): string | null {
  if (!from) return null;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (name) return from.username ? `${name} (@${from.username})` : name;
  return from.username ? `@${from.username}` : null;
}

/** The bot's @username, needed to build t.me deep links. */
export function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;
}

/**
 * True when deep linking is fully configured. The bot token alone is enough to
 * SEND messages, but a link also needs the username to address t.me.
 */
export function isTelegramLinkingConfigured(): boolean {
  return isTelegramConfigured() && telegramBotUsername() !== null;
}

/** How long a freshly-issued deep-link token stays redeemable. */
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Mint a single-use deep link for `companyId` and return the t.me URL. Replaces any
 * previous outstanding token for that company, so the newest button always wins and
 * an abandoned one stops working. Returns null when linking isn't configured.
 *
 * The token is 32 base64url chars from a CSPRNG — comfortably inside Telegram's
 * 64-char /start payload limit, and not guessable within the 15-minute window.
 */
export async function createProviderLinkUrl(companyId: string): Promise<string | null> {
  const username = telegramBotUsername();
  if (!isTelegramConfigured() || !username) return null;

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Buffer.from(bytes).toString("base64url"); // 32 chars

  await prisma.company.update({
    where: { id: companyId },
    data: {
      telegramLinkToken: token,
      telegramLinkExpires: new Date(Date.now() + LINK_TOKEN_TTL_MS),
    },
  });

  return `https://t.me/${username}?start=${token}`;
}

/**
 * Outcome of redeeming a provider deep link. Distinguished rather than collapsed to
 * null because the bot's reply differs meaningfully: "wrong link" and "your company
 * already has 5 accounts" send the provider to two very different places.
 */
export type ProviderLinkResult =
  | { status: "linked"; companyName: string }
  | { status: "already"; companyName: string }
  | { status: "limit"; companyName: string }
  | { status: "invalid" };

/**
 * Redeem a deep-link token: ADD `chatId` to the company that owns it and burn the
 * token so it can't be replayed.
 *
 * Adds rather than replaces — that's the whole point of the multi-chat table. A
 * company links the owner's phone and their staff's, and everyone gets the alerts.
 * Re-linking an account that's already on the company is a no-op success, not a
 * duplicate: it's what happens when someone taps an old link twice, and it should
 * look like it worked, because from their side it did.
 */
export async function addProviderChatByToken(
  token: string,
  chatId: number | string,
  label?: string | null,
): Promise<ProviderLinkResult> {
  const company = await prisma.company.findUnique({
    where: { telegramLinkToken: token },
    select: { id: true, name: true, telegramLinkExpires: true },
  });
  if (!company) return { status: "invalid" };

  // Expired: clear it so a stale token can't linger, and refuse.
  if (!company.telegramLinkExpires || company.telegramLinkExpires.getTime() < Date.now()) {
    await prisma.company.update({
      where: { id: company.id },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
    return { status: "invalid" };
  }

  // Burn the token first, and unconditionally. Whatever happens next — success,
  // limit, a crash — the token must not stay redeemable, or refusing it for the
  // limit would leave a live credential in someone's chat history.
  await prisma.company.update({
    where: { id: company.id },
    data: { telegramLinkToken: null, telegramLinkExpires: null },
  });

  const existing = await prisma.companyTelegramChat.findUnique({
    where: { companyId_chatId: { companyId: company.id, chatId: String(chatId) } },
    select: { id: true },
  });
  if (existing) return { status: "already", companyName: company.name };

  const count = await prisma.companyTelegramChat.count({ where: { companyId: company.id } });
  if (count >= MAX_COMPANY_TELEGRAM_CHATS) {
    return { status: "limit", companyName: company.name };
  }

  await prisma.companyTelegramChat.create({
    data: { companyId: company.id, chatId: String(chatId), label: label ?? null },
  });
  return { status: "linked", companyName: company.name };
}

/** Remove one linked Telegram account from a company. */
export async function removeProviderChat(companyId: string, chatRowId: string): Promise<void> {
  // Scoped by companyId as well as id, so a provider can't delete another
  // company's row by guessing its uuid.
  await prisma.companyTelegramChat.deleteMany({ where: { id: chatRowId, companyId } });
}

/** Disconnect ALL of a company's Telegram accounts, stopping its alerts on that channel. */
export async function unlinkProvider(companyId: string): Promise<void> {
  await prisma.companyTelegramChat.deleteMany({ where: { companyId } });
  await prisma.company.update({
    where: { id: companyId },
    data: { telegramChatId: null, telegramLinkToken: null, telegramLinkExpires: null },
  });
}

// ── Admin self-linking via the bot (webhook) ─────────────────────────────────
// Exactly the deep-link half of the provider mechanism above, mirrored onto
// User instead of Company — an admin has no phone number on file to fall back
// to, so there is no phone-share path here.

/**
 * Mint a single-use deep link for admin `userId` and return the t.me URL.
 * Replaces any previous outstanding token for that user. Returns null when
 * linking isn't configured.
 */
export async function createAdminLinkUrl(userId: string): Promise<string | null> {
  const username = telegramBotUsername();
  if (!isTelegramConfigured() || !username) return null;

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Buffer.from(bytes).toString("base64url"); // 32 chars

  await prisma.user.update({
    where: { id: userId },
    data: {
      telegramLinkToken: token,
      telegramLinkExpires: new Date(Date.now() + LINK_TOKEN_TTL_MS),
    },
  });

  return `https://t.me/${username}?start=${token}`;
}

/**
 * Redeem a deep-link token: bind `chatId` to the admin user that owns it and burn
 * the token so it can't be replayed. Returns the admin's name, or null when the
 * token is unknown, already used, or expired.
 */
export async function linkAdminByToken(
  token: string,
  chatId: number | string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { telegramLinkToken: token },
    select: { id: true, name: true, telegramLinkExpires: true },
  });
  if (!user) return null;

  if (!user.telegramLinkExpires || user.telegramLinkExpires.getTime() < Date.now()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: String(chatId),
      telegramLinkToken: null,
      telegramLinkExpires: null,
    },
  });
  return user.name;
}

/** Disconnect an admin's Telegram, stopping alerts on that channel for them. */
export async function unlinkAdmin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramLinkToken: null, telegramLinkExpires: null },
  });
}

/**
 * Link the Company whose phone (or whatsapp) matches `phone` to `chatId`. Matching
 * is by the last 10 significant digits (phoneTail), so local/CC/E.164 forms all
 * compare equal. Returns the linked company's name, or null if no match. Never
 * throws to the caller beyond DB errors (the webhook wraps it).
 */
export async function linkProviderByPhone(
  phone: string,
  chatId: number | string,
  label?: string | null,
): Promise<string | null> {
  const tail = phoneTail(phone);
  if (tail.length < 8) return null; // implausibly short — ignore

  // Matched in SQL, not in memory.
  //
  // This used to be `findMany({ select: … })` with NO where clause, matching in
  // JS — every company row transferred into Node on every link attempt, under a
  // comment reading "small dataset (a handful of companies)". That was true when
  // it was written. It is a full table load at ten thousand.
  //
  // The JS matching existed because phone numbers are stored inconsistently
  // (local `010…`, country-code `2010…`, E.164 `+2010…`), so equality on the raw
  // column misses. Postgres can normalize exactly the way phoneTail does —
  // strip non-digits, keep the last 10 — so the same comparison runs in the
  // database and returns at most two rows instead of the table.
  //
  // LIMIT 2, not 1, so an AMBIGUOUS match is detectable. Two companies sharing a
  // phone tail is a data error, and picking whichever row the planner returned
  // first would connect one company's Telegram — and therefore its customers'
  // messages — to another company's account. Refusing is the only safe reading.
  const matches = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name
    FROM "Company"
    WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = ${tail}
       OR right(regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g'), 10) = ${tail}
    LIMIT 2
  `;
  if (matches.length !== 1) {
    if (matches.length > 1) {
      console.warn(
        `[telegram] refusing to link: ${matches.length} companies share the phone ending ${tail}`,
      );
    }
    return null;
  }
  const match = matches[0];

  // Same add-don't-replace semantics as the deep link, including the cap. Silently
  // treating an over-limit phone link as success would be a lie: they'd wait for
  // alerts that never come.
  const existing = await prisma.companyTelegramChat.findUnique({
    where: { companyId_chatId: { companyId: match.id, chatId: String(chatId) } },
    select: { id: true },
  });
  if (existing) return match.name;

  const count = await prisma.companyTelegramChat.count({ where: { companyId: match.id } });
  if (count >= MAX_COMPANY_TELEGRAM_CHATS) return null;

  await prisma.companyTelegramChat.create({
    data: { companyId: match.id, chatId: String(chatId), label: label ?? null },
  });
  return match.name;
}

/**
 * Handle one inbound Telegram update from the webhook. Fail-open: any error is
 * logged and swallowed so the webhook always 200s (Telegram retries otherwise).
 *   • /start <token>  → redeem the dashboard deep link → confirm or reject.
 *   • /start (bare)   → reply with a one-tap "share my number" button.
 *   • a shared contact → match phone → store chat id → confirm or reject.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  try {
    const msg = update.message;
    const chatId = msg?.chat?.id;
    if (!chatId) return;

    // "/start <token>" — the dashboard deep link. Preferred path: the token alone
    // identifies the company (provider) or the user (admin), so we never touch the
    // phone number. Tokens are unique per table, so trying company then admin is
    // unambiguous — at most one of the two lookups can ever match.
    const label = senderLabel(msg?.from);
    const startPayload = msg.text?.match(/^\/start\s+(\S+)$/)?.[1];
    if (startPayload) {
      const provider = await addProviderChatByToken(startPayload, chatId, label);
      const adminName =
        provider.status === "invalid" ? await linkAdminByToken(startPayload, chatId) : null;

      let confirmation: string;
      switch (provider.status) {
        case "linked":
          confirmation = `✅ تم ربط حسابك بنجاح مع <b>${escapeHtml(provider.companyName)}</b>.\nهيوصلك هنا كل أوردر جديد فوراً.`;
          break;
        case "already":
          confirmation = `✅ حسابك مربوط بالفعل مع <b>${escapeHtml(provider.companyName)}</b>. الإشعارات شغالة عادي.`;
          break;
        case "limit":
          confirmation = `⚠️ <b>${escapeHtml(provider.companyName)}</b> وصلت للحد الأقصى (${MAX_COMPANY_TELEGRAM_CHATS} حسابات تليجرام).\nادخل على لوحة التحكم واحذف حساب قديم الأول.`;
          break;
        default:
          confirmation = adminName
            ? `✅ اتربطت يا <b>${escapeHtml(adminName)}</b>! هتوصلك هنا كل تنبيهات الإدارة فوراً.`
            : `⚠️ الرابط ده منتهي أو مستخدم قبل كده. ادخل على لوحة التحكم واضغط «ربط تليجرام» من تاني عشان تجيب رابط جديد.`;
      }
      await sendViaTelegram(chatId, confirmation, { reply_markup: { remove_keyboard: true } });
      return;
    }

    if (msg?.contact?.phone_number) {
      // Only accept a contact the sender shared about THEMSELVES. The
      // request_contact button always sets user_id to the sender, but a user can
      // also forward someone else's contact card from the attachment menu — that
      // arrives here identically. Without this check, anyone holding a provider's
      // number could share their card and redirect that provider's lead alerts to
      // their own chat.
      if (msg.contact.user_id !== chatId) {
        await sendViaTelegram(
          chatId,
          "⚠️ لازم تشارك رقمك انت شخصياً عن طريق زرار «شارك رقمي»، مش كارت جهة اتصال تانية.",
          { reply_markup: { remove_keyboard: true } },
        );
        return;
      }
      const name = await linkProviderByPhone(msg.contact.phone_number, chatId, label);
      await sendViaTelegram(
        chatId,
        name
          ? `✅ تم ربط حسابك بنجاح مع <b>${escapeHtml(name)}</b>.\nهيوصلك هنا كل أوردر جديد فوراً.`
          : `⚠️ الرقم ده مش متسجّل عندنا كمزوّد خدمة، أو الشركة وصلت للحد الأقصى (${MAX_COMPANY_TELEGRAM_CHATS} حسابات). اتأكد إنك بتشارك نفس الرقم المسجّل في حسابك، أو كلّم الإدارة.`,
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    // /start or any other text → prompt to share the number.
    await sendViaTelegram(
      chatId,
      "أهلاً بيك 👋\nعشان يوصلك إشعار بكل أوردر جديد على شركتك، اضغط الزرار تحت وشارك رقم تليفونك المسجّل عندنا.",
      {
        reply_markup: {
          keyboard: [[{ text: "📞 شارك رقمي", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  } catch (err) {
    console.error("[telegram] webhook update handling failed:", err);
  }
}
