import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/utils/unsubscribeToken";

export const dynamic = "force-dynamic";

// No withMaintenance: unsubscribing is the one write a customer must be able
// to make even while the public site is down for maintenance — the whole
// point of the link is "let me stop this without having to sign in or wait".

function page(title: string, body: string): Response {
  const html =
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title>` +
    `<style>body{font-family:Tahoma,Arial,sans-serif;background:#f7f9fd;color:#181c1f;` +
    `display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}` +
    `.card{max-width:420px;text-align:center;background:#fff;border-radius:16px;` +
    `padding:32px 28px;box-shadow:0 1px 2px rgba(0,0,0,.05),0 8px 24px -16px rgba(0,0,0,.25)}` +
    `h1{font-size:20px;margin:0 0 12px}p{color:#40484e;line-height:1.7;margin:0}` +
    `</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function unsubscribe(token: string | null): Promise<{ ok: boolean }> {
  if (!token) return { ok: false };
  const customerId = verifyUnsubscribeToken(token);
  if (!customerId) return { ok: false };
  // updateMany, not update: a deleted account's id still verifies (the HMAC
  // doesn't check existence), and that must 200 quietly rather than 500 —
  // there's nothing left to unsubscribe, which is a fine outcome for a link
  // whose only job is "make sure this address hears nothing further".
  await prisma.customerUser.updateMany({
    where: { id: customerId },
    data: { marketingEmailEnabled: false },
  });
  return { ok: true };
}

/**
 * GET /api/unsubscribe?token=... — the link every marketing email's footer
 * points to. Flips CustomerUser.marketingEmailEnabled off and shows a plain
 * confirmation page; no login, no confirmation click, matches what every
 * mailbox provider expects a one-click unsubscribe link to do. Transactional
 * mail (verification, receipts, security alerts) is never gated by this flag
 * — see notifyCustomer's own comment — so unsubscribing here can never stop
 * an order-related email.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { ok } = await unsubscribe(new URL(request.url).searchParams.get("token"));
  return ok
    ? page("تم إلغاء الاشتراك", "لن تستقبل إيميلات العروض والاقتراحات تاني. إيميلات طلباتك وحسابك هتفضل توصلك عادي.")
    : page("رابط غير صالح", "الرابط ده مش صالح أو منتهي. لو محتاج تلغي الاشتراك، استخدم الرابط اللي في آخر أي إيميل عروض وصلك.");
}

/**
 * POST /api/unsubscribe?token=... — RFC 8058 one-click unsubscribe. Mailbox
 * providers that support List-Unsubscribe-Post (the header every marketing
 * email carries — see notifications.service.ts's marketing headers) POST
 * here directly, no page render, expecting a bare 200. Same token, same
 * effect as the GET link; this exists purely for clients that prefer POST.
 */
export async function POST(request: NextRequest): Promise<Response> {
  await unsubscribe(new URL(request.url).searchParams.get("token"));
  return new Response(null, { status: 200 });
}
