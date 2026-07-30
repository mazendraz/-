// Feature E integration tests. The parts that matter most are the ACCESS rules —
// a chat carries private conversation between a customer and a company, and the
// customer has no account, so the reference + token pair is the whole gate.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as customerGET, POST as customerPOST } from "@/app/api/chat/route";
import { GET as providerListGET } from "@/app/api/provider/chat/route";
import { GET as providerGET, POST as providerPOST } from "@/app/api/provider/chat/[conversationId]/route";
import { GET as adminGET, POST as adminPOST, PATCH as adminPATCH } from "@/app/api/admin/chat/[conversationId]/route";
import { PATCH as hidePATCH } from "@/app/api/admin/chat/[conversationId]/messages/[messageId]/route";

const tag = `chat-${Date.now()}`;

function req(opts: {
  url?: string; method?: string; body?: unknown; token?: string;
  leadToken?: string; ip?: string;
} = {}): NextRequest {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.leadToken) headers.set("x-lead-token", opts.leadToken);
  headers.set("x-forwarded-for", opts.ip ?? "10.20.30.40");
  return new NextRequest(`http://localhost${opts.url ?? "/api/chat"}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

let categoryId = "", companyId = "", otherCompanyId = "";
let leadId = "", refNumber = "", trackingToken = "";
let legacyLeadId = "", legacyRef = "";
let providerToken = "", otherProviderToken = "", adminToken = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Cat", description: "d", icon: "home" },
  });
  categoryId = category.id;

  const mkCompany = (slug: string) => prisma.company.create({
    data: {
      categoryId, slug, name: `Co ${slug}`, tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000000", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024",
    },
  });
  companyId = (await mkCompany(`${tag}-a`)).id;
  otherCompanyId = (await mkCompany(`${tag}-b`)).id;

  refNumber = `AA-${tag}-1`;
  trackingToken = `tok-${tag}-secret`;
  const lead = await prisma.lead.create({
    data: {
      refNumber, trackingToken, companyId, service: "s", customerName: "Customer One",
      phone: "01012345678", district: "R7", budget: "b", description: "d",
    },
  });
  leadId = lead.id;

  // A lead with NO conversation row — stands in for everything that existed
  // before this feature shipped.
  legacyRef = `AA-${tag}-legacy`;
  const legacy = await prisma.lead.create({
    data: {
      refNumber: legacyRef, trackingToken: `tok-${tag}-legacy`, companyId,
      service: "s", customerName: "Legacy Customer",
      phone: "01099999999", district: "R7", budget: "b", description: "d",
    },
  });
  legacyLeadId = legacy.id;

  const mkUser = async (suffix: string, role: "PROVIDER" | "ADMIN", cid: string | null) =>
    prisma.user.create({
      data: {
        email: `${tag}-${suffix}@test.local`, passwordHash: await hashPassword("pw12345678"),
        role, isActive: true, name: suffix, companyId: cid,
      },
    });
  const p1 = await mkUser("p1", "PROVIDER", companyId);
  const p2 = await mkUser("p2", "PROVIDER", otherCompanyId);
  const ad = await mkUser("ad", "ADMIN", null);
  providerToken = await signToken({ sub: p1.id, role: "PROVIDER", companyId });
  otherProviderToken = await signToken({ sub: p2.id, role: "PROVIDER", companyId: otherCompanyId });
  adminToken = await signToken({ sub: ad.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { conversation: { companyId: { in: [companyId, otherCompanyId] } } } });
  await prisma.conversation.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.lead.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

let ipSeq = 0;
const nextIp = () => `10.20.30.${(ipSeq += 1) % 250}`;

const customerRead = (ref = refNumber, token = trackingToken, after?: number) =>
  customerGET(req({
    url: `/api/chat?ref=${encodeURIComponent(ref)}${after ? `&after=${after}` : ""}`,
    leadToken: token, ip: nextIp(),
  }));

const customerSend = (body: string, ref = refNumber, token = trackingToken) =>
  customerPOST(req({
    url: `/api/chat?ref=${encodeURIComponent(ref)}`, method: "POST",
    body: { body }, leadToken: token, ip: nextIp(),
  }));

describe("customer access", () => {
  it("opens the thread with the right reference + token", async () => {
    const res = await customerRead();
    expect(res.status).toBe(200);
    const thread = await res.json();
    expect(thread.conversation.leadId).toBe(leadId);
  });

  // The gate must not double as an oracle for which references exist.
  it("returns 404 for a wrong token — same as an unknown reference", async () => {
    const wrongToken = await customerRead(refNumber, "not-the-token");
    const unknownRef = await customerRead("AA-does-not-exist", trackingToken);
    expect(wrongToken.status).toBe(404);
    expect(unknownRef.status).toBe(404);
    expect(await wrongToken.json()).toEqual(await unknownRef.json());
  });

  it("returns 404 with no token at all", async () => {
    const res = await customerGET(req({ url: `/api/chat?ref=${refNumber}`, ip: nextIp() }));
    expect(res.status).toBe(404);
  });

  it("rejects a request with no reference", async () => {
    const res = await customerGET(req({ url: "/api/chat", leadToken: trackingToken, ip: nextIp() }));
    expect(res.status).toBe(400);
  });

  // Everything in the lead table predates this feature; none of it has a thread.
  it("creates the conversation on demand for a pre-existing lead", async () => {
    expect(await prisma.conversation.findUnique({ where: { leadId: legacyLeadId } })).toBeNull();
    const res = await customerRead(legacyRef, `tok-${tag}-legacy`);
    expect(res.status).toBe(200);
    expect(await prisma.conversation.findUnique({ where: { leadId: legacyLeadId } })).not.toBeNull();
  });

  it("sends a message", async () => {
    const res = await customerSend("Hello, when can you start?");
    expect(res.status).toBe(201);
    expect((await res.json()).sender).toBe("CUSTOMER");
  });

  it("rejects an empty message", async () => {
    expect((await customerSend("   ")).status).toBe(400);
  });

  it("rejects a message over the length cap", async () => {
    expect((await customerSend("x".repeat(2001))).status).toBe(400);
  });
});

describe("delta polling", () => {
  it("returns only messages newer than `after`", async () => {
    await customerSend("first");
    const full = await (await customerRead()).json();
    const newest = Math.max(...full.messages.map((m: { createdAt: number }) => m.createdAt));

    await customerSend("second");
    const delta = await (await customerRead(refNumber, trackingToken, newest)).json();

    const bodies = delta.messages.map((m: { body: string }) => m.body);
    expect(bodies).toContain("second");
    expect(bodies).not.toContain("first");
  });
});

// The cap on a single fetch has to drop the OLDEST messages, not the newest.
// `orderBy: asc` + `take` truncated from the wrong end, so opening a long thread
// showed its beginning and nothing either side had said recently.
describe("long thread truncation", () => {
  it("returns the NEWEST messages when the thread exceeds the cap", async () => {
    // The earlier tests have already opened this thread, so it exists.
    const conversation = await prisma.conversation.findUnique({ where: { leadId } });
    // 210 rows against a 200 cap, with strictly increasing timestamps so
    // "newest" is unambiguous.
    const base = Date.now() - 300_000;
    await prisma.message.createMany({
      data: Array.from({ length: 210 }, (_, i) => ({
        conversationId: conversation!.id,
        sender: "CUSTOMER" as const,
        body: `bulk-${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    });

    const body = await (await customerRead()).json();
    const bodies = body.messages.map((m: { body: string }) => m.body);

    expect(body.messages.length).toBeLessThanOrEqual(200);
    // The last thing said must be present; the very first must be the one dropped.
    expect(bodies).toContain("bulk-209");
    expect(bodies).not.toContain("bulk-0");
    // Still oldest-first for rendering, despite being queried newest-first.
    const times = body.messages.map((m: { createdAt: number }) => m.createdAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));

    await prisma.message.deleteMany({ where: { body: { startsWith: "bulk-" } } });
  });
});

describe("provider access", () => {
  let conversationId = "";

  beforeEach(async () => {
    const c = await prisma.conversation.findUnique({ where: { leadId } });
    conversationId = c!.id;
  });

  it("reads a thread belonging to its own company", async () => {
    const res = await providerGET(
      req({ token: providerToken }), ctx({ conversationId }),
    );
    expect(res.status).toBe(200);
  });

  // A conversation carries the customer's private messages — reading another
  // company's would be a straight data leak.
  it("REFUSES a conversation belonging to another company", async () => {
    const res = await providerGET(
      req({ token: otherProviderToken }), ctx({ conversationId }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses to POST into another company's conversation", async () => {
    const res = await providerPOST(
      req({ method: "POST", body: { body: "intruding" }, token: otherProviderToken }),
      ctx({ conversationId }),
    );
    expect(res.status).toBe(403);
  });

  it("replies to its own conversation", async () => {
    const res = await providerPOST(
      req({ method: "POST", body: { body: "We can start Sunday." }, token: providerToken }),
      ctx({ conversationId }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).sender).toBe("PROVIDER");
  });

  it("lists only its own company's threads", async () => {
    const res = await providerListGET(req({ token: providerToken }), undefined as never);
    const rows = await res.json();
    expect(rows.every((c: { companyId: string }) => c.companyId === companyId)).toBe(true);
  });
});

describe("unread counters", () => {
  it("raises the other side's badge and clears the sender's own", async () => {
    const before = await prisma.conversation.findUnique({ where: { leadId } });
    await customerSend("counter check");
    const after = await prisma.conversation.findUnique({ where: { leadId } });
    expect(after!.providerUnread).toBeGreaterThan(before!.providerUnread);
    expect(after!.customerUnread).toBe(0);
  });

  it("clears the customer's badge on a full open, not on a delta poll", async () => {
    const c = await prisma.conversation.findUnique({ where: { leadId } });
    await providerPOST(
      req({ method: "POST", body: { body: "ping" }, token: providerToken }),
      ctx({ conversationId: c!.id }),
    );
    expect((await prisma.conversation.findUnique({ where: { leadId } }))!.customerUnread).toBeGreaterThan(0);

    // A delta poll is not "I read it".
    await customerRead(refNumber, trackingToken, Date.now());
    expect((await prisma.conversation.findUnique({ where: { leadId } }))!.customerUnread).toBeGreaterThan(0);

    await customerRead();
    expect((await prisma.conversation.findUnique({ where: { leadId } }))!.customerUnread).toBe(0);
  });
});

describe("admin moderation", () => {
  let conversationId = "", messageId = "";

  beforeEach(async () => {
    const c = await prisma.conversation.findUnique({ where: { leadId } });
    conversationId = c!.id;
    const m = await prisma.message.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" } });
    messageId = m!.id;
  });

  it("can post as ADMIN so both sides see it came from the platform", async () => {
    const res = await adminPOST(
      req({ method: "POST", body: { body: "Al Assema here — following up." }, token: adminToken }),
      ctx({ conversationId }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).sender).toBe("ADMIN");
  });

  it("hides a message from the customer and the provider but NOT from admins", async () => {
    await hidePATCH(
      req({ method: "PATCH", body: { hidden: true }, token: adminToken }),
      ctx({ conversationId, messageId }),
    );

    const customerView = await (await customerRead()).json();
    expect(customerView.messages.some((m: { id: string }) => m.id === messageId)).toBe(false);

    const providerView = await (await providerGET(req({ token: providerToken }), ctx({ conversationId }))).json();
    expect(providerView.messages.some((m: { id: string }) => m.id === messageId)).toBe(false);

    // The row survives — moderation must not destroy the record.
    const adminView = await (await adminGET(req({ token: adminToken }), ctx({ conversationId }))).json();
    const seen = adminView.messages.find((m: { id: string }) => m.id === messageId);
    expect(seen).toBeDefined();
    expect(seen.hidden).toBe(true);

    await hidePATCH(
      req({ method: "PATCH", body: { hidden: false }, token: adminToken }),
      ctx({ conversationId, messageId }),
    );
  });

  it("closes a conversation, and closed threads reject new messages", async () => {
    await adminPATCH(
      req({ method: "PATCH", body: { closed: true }, token: adminToken }),
      ctx({ conversationId }),
    );
    expect((await customerSend("after close")).status).toBe(400);

    await adminPATCH(
      req({ method: "PATCH", body: { closed: false }, token: adminToken }),
      ctx({ conversationId }),
    );
    expect((await customerSend("after reopen")).status).toBe(201);
  });
});

describe("rate limiting", () => {
  it("stops a flood of sends from one IP", async () => {
    const ip = "10.77.77.77";
    const send = () => customerPOST(req({
      url: `/api/chat?ref=${refNumber}`, method: "POST",
      body: { body: "spam" }, leadToken: trackingToken, ip,
    }));

    let limited = false;
    // The cap is 20/min; 25 attempts from one IP must trip it.
    for (let i = 0; i < 25; i++) {
      if ((await send()).status === 429) { limited = true; break; }
    }
    expect(limited).toBe(true);
  });
});
