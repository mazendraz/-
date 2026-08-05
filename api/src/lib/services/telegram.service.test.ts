import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { phoneTail } from "@/lib/utils/phone";
import type { ApiLead } from "@/lib/apiTypes";

const findMany = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
    user: {
      findMany: (...a: unknown[]) => userFindMany(...a),
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));

const {
  buildLeadTelegramMessage,
  handleTelegramUpdate,
  linkProviderByToken,
  linkAdminByToken,
  notifyAdminTelegram,
  notifyAdminChatTelegram,
} = await import("@/lib/services/telegram.service");

const lead: ApiLead = {
  id: "lead-1",
  refNumber: "AA-20260101-7F3K",
  companySlug: "aura-interiors",
  companyName: "Aura Interiors",
  service: "Full Interior Design",
  name: "Mona Adel",
  phone: "01012345678",
  district: "R7 District",
  budget: "EGP 150,000 – 500,000",
  description: "Need a full fit-out",
  status: "New",
  reviewed: false,
  createdAt: Date.UTC(2026, 0, 1),
};

describe("buildLeadTelegramMessage", () => {
  it("includes the lead details", () => {
    const msg = buildLeadTelegramMessage(lead, "Aura Interiors");
    expect(msg).toContain("AA-20260101-7F3K");
    expect(msg).toContain("Mona Adel");
    expect(msg).toContain("01012345678");
    expect(msg).toContain("Full Interior Design");
  });

  it("prefixes the company name in the admin variant", () => {
    const msg = buildLeadTelegramMessage(lead, "Aura Interiors", true);
    expect(msg).toContain("Aura Interiors");
  });

  it("HTML-escapes customer-supplied fields so markup can't break", () => {
    const evil = { ...lead, name: "<script>&x" };
    const msg = buildLeadTelegramMessage(evil, "Aura Interiors");
    expect(msg).toContain("&lt;script&gt;&amp;x");
    expect(msg).not.toContain("<script>");
  });

  it("omits the budget/details lines when the customer left them blank", () => {
    const msg = buildLeadTelegramMessage({ ...lead, budget: "", description: "" }, "Aura Interiors");
    expect(msg).not.toContain("الميزانية");
    expect(msg).not.toContain("التفاصيل");
  });
});

describe("provider phone matching (phoneTail)", () => {
  // A shared Telegram contact arrives in E.164-ish form; the stored company phone
  // may be local. They must match on the last 10 significant digits.
  it("matches a shared contact against a locally-stored company phone", () => {
    const contactPhone = "+201012345678"; // what Telegram delivers
    const storedPhone = "01012345678"; // what the site stores
    expect(phoneTail(contactPhone)).toBe(phoneTail(storedPhone));
  });

  it("does not match different numbers", () => {
    expect(phoneTail("+201012345678")).not.toBe(phoneTail("01099999999"));
  });
});

describe("handleTelegramUpdate contact ownership", () => {
  // A shared contact may be the sender's own (request_contact button) or someone
  // else's card forwarded from the attachment menu. Only the former may link.
  // No bot token is set here, so outbound sends are no-ops and these assert which
  // branch ran by whether the company lookup happened at all.
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    findMany.mockClear();
    update.mockClear();
  });

  it("ignores a forwarded contact card belonging to someone else", async () => {
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 999 } },
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("links the company when the sender shares their own contact", async () => {
    findMany.mockResolvedValue([
      { id: "c1", name: "Aura Interiors", phone: "01012345678", whatsapp: null },
    ]);
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramChatId: "555" },
    });
  });
});

describe("linkProviderByToken", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    findUnique.mockReset();
    update.mockReset();
  });

  it("binds the chat and burns the token when the token is valid", async () => {
    findUnique.mockResolvedValue({
      id: "c1",
      name: "Aura Interiors",
      telegramLinkExpires: new Date(Date.now() + 60_000),
    });
    await expect(linkProviderByToken("tok", 777)).resolves.toBe("Aura Interiors");
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramChatId: "777", telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("refuses an expired token and does not bind a chat", async () => {
    findUnique.mockResolvedValue({
      id: "c1",
      name: "Aura Interiors",
      telegramLinkExpires: new Date(Date.now() - 60_000),
    });
    await expect(linkProviderByToken("tok", 777)).resolves.toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("refuses an unknown token", async () => {
    findUnique.mockResolvedValue(null);
    await expect(linkProviderByToken("nope", 777)).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("redeems a /start <token> deep link end to end", async () => {
    findUnique.mockResolvedValue({
      id: "c1",
      name: "Aura Interiors",
      telegramLinkExpires: new Date(Date.now() + 60_000),
    });
    await handleTelegramUpdate({ message: { chat: { id: 777 }, text: "/start abc123" } });
    expect(findUnique).toHaveBeenCalledWith({
      where: { telegramLinkToken: "abc123" },
      select: { id: true, name: true, telegramLinkExpires: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramChatId: "777", telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("falls through to the phone prompt on a bare /start", async () => {
    await handleTelegramUpdate({ message: { chat: { id: 777 }, text: "/start" } });
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("linkAdminByToken", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    userFindUnique.mockReset();
    userUpdate.mockReset();
  });

  it("binds the chat and burns the token when the token is valid", async () => {
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Mazen",
      telegramLinkExpires: new Date(Date.now() + 60_000),
    });
    await expect(linkAdminByToken("tok", 777)).resolves.toBe("Mazen");
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { telegramChatId: "777", telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("refuses an expired token and does not bind a chat", async () => {
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Mazen",
      telegramLinkExpires: new Date(Date.now() - 60_000),
    });
    await expect(linkAdminByToken("tok", 777)).resolves.toBeNull();
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("refuses an unknown token", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(linkAdminByToken("nope", 777)).resolves.toBeNull();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("a /start <token> deep link falls through to the admin table when no company owns the token", async () => {
    findUnique.mockResolvedValue(null); // no company owns this token
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Mazen",
      telegramLinkExpires: new Date(Date.now() + 60_000),
    });
    await handleTelegramUpdate({ message: { chat: { id: 777 }, text: "/start abc123" } });
    expect(findUnique).toHaveBeenCalledWith({
      where: { telegramLinkToken: "abc123" },
      select: { id: true, name: true, telegramLinkExpires: true },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { telegramChatId: "777", telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("never touches the admin table when the token already resolved to a company", async () => {
    findUnique.mockResolvedValue({
      id: "c1",
      name: "Aura Interiors",
      telegramLinkExpires: new Date(Date.now() + 60_000),
    });
    await handleTelegramUpdate({ message: { chat: { id: 777 }, text: "/start abc123" } });
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("admin notification fan-out (adminChatIds)", () => {
  const lead: ApiLead = {
    id: "lead-1", refNumber: "AA-20260101-7F3K", companySlug: "aura-interiors",
    companyName: "Aura Interiors", service: "Full Interior Design", name: "Mona Adel",
    phone: "01012345678", district: "R7 District", budget: "EGP 150,000 – 500,000",
    description: "Need a full fit-out", status: "New", reviewed: false, createdAt: Date.UTC(2026, 0, 1),
  };

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    userFindMany.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
  });
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    vi.unstubAllGlobals();
  });

  it("sends to every linked admin's chat id, deduplicated against the legacy env var", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    userFindMany.mockResolvedValue([{ telegramChatId: "111" }, { telegramChatId: "222" }]);

    await expect(notifyAdminTelegram(lead, "Aura Interiors")).resolves.toBe(true);

    expect(userFindMany).toHaveBeenCalledWith({
      where: { role: "ADMIN", isActive: true, telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });
    const chatIdsSent = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string).chat_id,
    );
    expect(new Set(chatIdsSent)).toEqual(new Set(["111", "222"])); // "111" sent once, not twice
    expect(chatIdsSent).toHaveLength(2);
  });

  it("works with only self-linked admins and no legacy env var set", async () => {
    userFindMany.mockResolvedValue([{ telegramChatId: "333" }]);
    await expect(notifyAdminChatTelegram("hi")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("skips sending when no admin is linked and no env var is set", async () => {
    userFindMany.mockResolvedValue([]);
    await expect(notifyAdminTelegram(lead, "Aura Interiors")).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("one admin's failed send never blocks another admin's message", async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = "111";
    userFindMany.mockResolvedValue([{ telegramChatId: "222" }]);
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url: string, init: RequestInit) => {
      const chatId = JSON.parse(init.body as string).chat_id;
      if (chatId === "111") return { ok: false, status: 500, text: async () => "boom" };
      return { ok: true, text: async () => "" };
    });

    await expect(notifyAdminTelegram(lead, "Aura Interiors")).resolves.toBe(true); // the "222" send still went through
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
