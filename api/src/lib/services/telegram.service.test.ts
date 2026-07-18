import { beforeEach, describe, expect, it, vi } from "vitest";
import { phoneTail } from "@/lib/utils/phone";
import type { ApiLead } from "@/lib/apiTypes";

const findMany = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

const { buildLeadTelegramMessage, handleTelegramUpdate, linkProviderByToken } = await import(
  "@/lib/services/telegram.service"
);

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
