// New feature: an admin can self-link their own Telegram from the dashboard
// (mirrors the existing provider "Connect Telegram" flow) instead of the whole
// platform sharing one hardcoded TELEGRAM_ADMIN_CHAT_ID. This exercises the route
// wiring: only ADMIN may call it, it's scoped to the caller's own account, and
// disconnect is idempotent. Whether the bot itself is configured depends on the
// local .env (TELEGRAM_BOT_TOKEN/USERNAME) — checked dynamically rather than
// assumed, so this passes the same whether or not those are set. The deep-link
// REDEMPTION path (linkAdminByToken, the webhook fallthrough, the notification
// fan-out) is covered with mocked Prisma + fetch in telegram.service.test.ts.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { isTelegramLinkingConfigured } from "@/lib/services/telegram.service";

import { GET as adminTelegramGET, DELETE as adminTelegramDELETE } from "@/app/api/admin/telegram/route";
import { POST as adminTelegramLinkPOST } from "@/app/api/admin/telegram/link/route";

const tag = `admintg-${Date.now()}`;

function req(url: string, opts: { method?: string; token?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost${url}`, { method: opts.method ?? "GET", headers });
}

let adminId = "";
let adminToken = "";
let providerToken = "";

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "Admin",
    },
  });
  adminId = admin.id;
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });

  const provider = await prisma.user.create({
    data: {
      email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", isActive: true, name: "Provider",
    },
  });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId: null });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
});

describe("GET /admin/telegram", () => {
  it("reports not-linked for a fresh admin", async () => {
    const res = await adminTelegramGET(req("/api/admin/telegram", { token: adminToken }), undefined as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: isTelegramLinkingConfigured(), linked: false });
  });

  it("403s a provider — this is admin-only", async () => {
    const res = await adminTelegramGET(req("/api/admin/telegram", { token: providerToken }), undefined as never);
    expect(res.status).toBe(403);
  });

  it("401s an unauthenticated call", async () => {
    const res = await adminTelegramGET(req("/api/admin/telegram"), undefined as never);
    expect(res.status).toBe(401);
  });
});

describe("POST /admin/telegram/link", () => {
  it("mints a deep link scoped to the caller's own account (or url: null if unconfigured)", async () => {
    const res = await adminTelegramLinkPOST(req("/api/admin/telegram/link", { method: "POST", token: adminToken }), undefined as never);
    expect(res.status).toBe(200);
    const { url } = await res.json();
    const me = await prisma.user.findUnique({ where: { id: adminId } });

    if (isTelegramLinkingConfigured()) {
      expect(url).toMatch(/^https:\/\/t\.me\/.+\?start=.+/);
      // The minted token is this admin's own — never another user's or a company's.
      expect(me?.telegramLinkToken).toBeTruthy();
      expect(url).toContain(me!.telegramLinkToken);
    } else {
      expect(url).toBeNull();
      expect(me?.telegramLinkToken).toBeNull();
    }
  });
});

describe("DELETE /admin/telegram", () => {
  it("is idempotent when the admin was never linked", async () => {
    const res = await adminTelegramDELETE(req("/api/admin/telegram", { method: "DELETE", token: adminToken }), undefined as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: isTelegramLinkingConfigured(), linked: false });
  });

  it("only unlinks the caller's own account, never another admin's", async () => {
    const other = await prisma.user.create({
      data: {
        email: `${tag}-other@test.local`, passwordHash: await hashPassword("pw12345678"),
        role: "ADMIN", isActive: true, name: "Other Admin", telegramChatId: "999",
      },
    });
    await adminTelegramDELETE(req("/api/admin/telegram", { method: "DELETE", token: adminToken }), undefined as never);
    const untouched = await prisma.user.findUnique({ where: { id: other.id } });
    expect(untouched?.telegramChatId).toBe("999");
  });
});
