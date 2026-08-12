import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { phoneTail } from "@/lib/utils/phone";
import type { ApiLead } from "@/lib/apiTypes";

const findMany = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
// Phone→company matching moved from `company.findMany` (load every row, match in
// JS) to a bounded `$queryRaw` that normalizes and compares in Postgres — see
// linkProviderByPhone. The mock has to offer what the code actually calls, and
// the assertions below moved with it: asserting "findMany was not called" would
// now pass trivially, proving nothing.
const queryRaw = vi.fn();
// CompanyTelegramChat — a company may link several Telegram accounts, so linking
// creates a ROW here rather than overwriting a column on Company.
const tgFindUnique = vi.fn();
const tgFindMany = vi.fn();
const tgCount = vi.fn();
const tgCreate = vi.fn();
const tgDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    company: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
    companyTelegramChat: {
      findUnique: (...a: unknown[]) => tgFindUnique(...a),
      findMany: (...a: unknown[]) => tgFindMany(...a),
      count: (...a: unknown[]) => tgCount(...a),
      create: (...a: unknown[]) => tgCreate(...a),
      deleteMany: (...a: unknown[]) => tgDeleteMany(...a),
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
  addProviderChatByToken,
  linkAdminByToken,
  notifyAdminTelegram,
  notifyAdminChatTelegram,
  MAX_COMPANY_TELEGRAM_CHATS,
} = await import("@/lib/services/telegram.service");

/** No existing row, room to spare — the happy path for every link test. */
function tgRoomAvailable() {
  tgFindUnique.mockResolvedValue(null);
  tgCount.mockResolvedValue(0);
  tgCreate.mockResolvedValue({ id: "row-1" });
}

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
    queryRaw.mockReset();
    update.mockClear();
    tgFindUnique.mockReset();
    tgCount.mockReset();
    tgCreate.mockReset();
    tgRoomAvailable();
  });

  it("ignores a forwarded contact card belonging to someone else", async () => {
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 999 } },
    });
    // The ownership check must short-circuit BEFORE the database is touched —
    // asserted against the query the code really issues.
    expect(queryRaw).not.toHaveBeenCalled();
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("links the company when the sender shares their own contact", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", name: "Aura Interiors" }]);
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(tgCreate).toHaveBeenCalledWith({
      data: { companyId: "c1", chatId: "555", label: null },
    });
  });

  it("adds a SECOND account instead of replacing the first", async () => {
    // The bug this guards: the old single telegramChatId column meant the second
    // person to link silently knocked the first one off the alerts.
    queryRaw.mockResolvedValue([{ id: "c1", name: "Aura Interiors" }]);
    tgCount.mockResolvedValue(1); // one account already linked
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(tgCreate).toHaveBeenCalledWith({
      data: { companyId: "c1", chatId: "555", label: null },
    });
  });

  it("refuses a link past the per-company cap", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", name: "Aura Interiors" }]);
    tgCount.mockResolvedValue(MAX_COMPANY_TELEGRAM_CHATS);
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("does not duplicate an account that is already linked", async () => {
    queryRaw.mockResolvedValue([{ id: "c1", name: "Aura Interiors" }]);
    tgFindUnique.mockResolvedValue({ id: "row-existing" });
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("matches in the DATABASE rather than loading every company into memory", async () => {
    // The regression this guards: the previous implementation called
    // `company.findMany({ select })` with no where clause and matched in JS,
    // under a comment assuming "a handful of companies". That is a full table
    // load per webhook once the directory is real.
    queryRaw.mockResolvedValue([{ id: "c1", name: "Aura Interiors" }]);
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("refuses to link when two companies share the same phone tail", async () => {
    // Ambiguity is a data error, and picking whichever row came back first would
    // wire one company's Telegram — and therefore its customers' messages — to a
    // different company's account.
    queryRaw.mockResolvedValue([
      { id: "c1", name: "Aura Interiors" },
      { id: "c2", name: "Someone Else" },
    ]);
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("does nothing when no company matches", async () => {
    queryRaw.mockResolvedValue([]);
    await handleTelegramUpdate({
      message: { chat: { id: 555 }, contact: { phone_number: "+201012345678", user_id: 555 } },
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });
});

describe("addProviderChatByToken", () => {
  const liveToken = () => ({
    id: "c1",
    name: "Aura Interiors",
    telegramLinkExpires: new Date(Date.now() + 60_000),
  });

  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    findUnique.mockReset();
    update.mockReset();
    tgFindUnique.mockReset();
    tgCount.mockReset();
    tgCreate.mockReset();
    tgRoomAvailable();
  });

  it("adds the chat and burns the token when the token is valid", async () => {
    findUnique.mockResolvedValue(liveToken());
    await expect(addProviderChatByToken("tok", 777)).resolves.toEqual({
      status: "linked",
      companyName: "Aura Interiors",
    });
    expect(tgCreate).toHaveBeenCalledWith({
      data: { companyId: "c1", chatId: "777", label: null },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("keeps the accounts already linked — a new link ADDS, never replaces", async () => {
    findUnique.mockResolvedValue(liveToken());
    tgCount.mockResolvedValue(2);
    await addProviderChatByToken("tok", 777);
    // Nothing deletes or overwrites the existing rows; only an insert happens.
    expect(tgDeleteMany).not.toHaveBeenCalled();
    expect(tgCreate).toHaveBeenCalledTimes(1);
  });

  it("reports the cap instead of silently dropping the link", async () => {
    findUnique.mockResolvedValue(liveToken());
    tgCount.mockResolvedValue(MAX_COMPANY_TELEGRAM_CHATS);
    await expect(addProviderChatByToken("tok", 777)).resolves.toEqual({
      status: "limit",
      companyName: "Aura Interiors",
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("burns the token even when the cap refuses the link", async () => {
    // Otherwise a live credential stays sitting in the provider's chat history.
    findUnique.mockResolvedValue(liveToken());
    tgCount.mockResolvedValue(MAX_COMPANY_TELEGRAM_CHATS);
    await addProviderChatByToken("tok", 777);
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
  });

  it("treats re-linking an already-linked account as success, not a duplicate", async () => {
    findUnique.mockResolvedValue(liveToken());
    tgFindUnique.mockResolvedValue({ id: "row-existing" });
    await expect(addProviderChatByToken("tok", 777)).resolves.toEqual({
      status: "already",
      companyName: "Aura Interiors",
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("refuses an expired token and does not add a chat", async () => {
    findUnique.mockResolvedValue({
      id: "c1",
      name: "Aura Interiors",
      telegramLinkExpires: new Date(Date.now() - 60_000),
    });
    await expect(addProviderChatByToken("tok", 777)).resolves.toEqual({ status: "invalid" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { telegramLinkToken: null, telegramLinkExpires: null },
    });
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("refuses an unknown token", async () => {
    findUnique.mockResolvedValue(null);
    await expect(addProviderChatByToken("nope", 777)).resolves.toEqual({ status: "invalid" });
    expect(update).not.toHaveBeenCalled();
    expect(tgCreate).not.toHaveBeenCalled();
  });

  it("redeems a /start <token> deep link end to end, labelling the row", async () => {
    findUnique.mockResolvedValue(liveToken());
    await handleTelegramUpdate({
      message: {
        chat: { id: 777 },
        text: "/start abc123",
        from: { first_name: "Mazen", username: "mazen" },
      },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { telegramLinkToken: "abc123" },
      select: { id: true, name: true, telegramLinkExpires: true },
    });
    expect(tgCreate).toHaveBeenCalledWith({
      data: { companyId: "c1", chatId: "777", label: "Mazen (@mazen)" },
    });
  });

  it("falls through to the phone prompt on a bare /start", async () => {
    await handleTelegramUpdate({ message: { chat: { id: 777 }, text: "/start" } });
    expect(findUnique).not.toHaveBeenCalled();
    expect(tgCreate).not.toHaveBeenCalled();
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
