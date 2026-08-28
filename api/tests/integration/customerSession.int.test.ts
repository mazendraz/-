// The customer's session and the data it unlocks, end to end against real routes.
//
// Both bugs this file pins down were reported the same way — "my sign-in isn't
// saved, and when I sign in again my old chats and requests don't load" — and
// neither was visible from any single route in isolation:
//
//   1. Staff and customer sessions shared ONE cookie name, so a browser could
//      hold only one. Signing into the dashboard evicted the customer session
//      (and vice versa); the evicted side then 401'd and the frontend cleared
//      its cached profile, which looks exactly like "it didn't save".
//   2. A request pulled from the ACCOUNT carries no trackingToken, and the
//      anonymous chat gate refuses the phone fallback for any lead that has a
//      token stored. So every request made on another device was unreachable
//      through the only path the website used.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_SESSION_COOKIE,
  SESSION_COOKIE,
  hashPassword,
  signToken,
} from "@/lib/auth";

import { POST as customerLoginPOST } from "@/app/api/auth/customer/login/route";
import { POST as customerLogoutPOST } from "@/app/api/auth/customer/logout/route";
import { GET as meGET } from "@/app/api/customer/me/route";
import { GET as authMeGET } from "@/app/api/auth/me/route";
import { GET as accountLeadsGET } from "@/app/api/customer/leads/route";
import { GET as accountSummariesGET } from "@/app/api/customer/chat/summaries/route";
import {
  GET as accountThreadGET,
  POST as accountSendPOST,
} from "@/app/api/customer/leads/[id]/messages/route";
import { GET as anonThreadGET } from "@/app/api/chat/route";

const tag = `csession-${Date.now()}`;
const EMAIL = `${tag}@example.com`;
const PASSWORD = "Str0ng-Passw0rd!x";

let companyId = "";
let categoryId = "";
let leadId = "";
let refNumber = "";
let staffToken = "";
let staffEmail = "";

/** A request with an explicit cookie jar, the way a browser sends one. */
function req(
  opts: {
    url?: string;
    method?: string;
    body?: unknown;
    cookies?: Record<string, string>;
    ip?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.cookies && Object.keys(opts.cookies).length > 0) {
    headers.set(
      "cookie",
      Object.entries(opts.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    );
  }
  headers.set("x-forwarded-for", opts.ip ?? "10.20.30.55");
  return new NextRequest(`http://localhost${opts.url ?? "/api/customer/me"}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

/** The cookies a response sets, by name. */
function setCookies(res: Response): Map<string, { value: string; maxAge?: number }> {
  const out = new Map<string, { value: string; maxAge?: number }>();
  for (const raw of res.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const idx = pair.indexOf("=");
    const maxAgeAttr = attrs.find((a) => a.trim().toLowerCase().startsWith("max-age="));
    out.set(pair.slice(0, idx).trim(), {
      value: pair.slice(idx + 1),
      maxAge: maxAgeAttr ? Number(maxAgeAttr.split("=")[1]) : undefined,
    });
  }
  return out;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Cat", description: "d", icon: "home" },
  });
  categoryId = category.id;

  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] },
      slug: `${tag}-co`,
      name: "Co",
      tagline: "t",
      about: "a",
      logo: "/l.jpg",
      cover: "/c.jpg",
      services: [],
      gallery: [],
      badges: [],
      phone: "0100000000",
      location: "NC",
      yearsExperience: 1,
      responseTime: "1h",
      verifiedSince: "2024",
    },
  });
  companyId = company.id;

  const customer = await prisma.customerUser.create({
    data: {
      email: EMAIL,
      name: "Customer",
      passwordHash: await hashPassword(PASSWORD),
      emailVerified: true,
    },
  });

  // A request the account owns and this browser never saw — it HAS a tracking
  // token server-side, which is what makes the anonymous phone fallback refuse
  // it. Exactly the shape of "a request I made on my phone".
  refNumber = `AA-${tag}-1`;
  const lead = await prisma.lead.create({
    data: {
      refNumber,
      trackingToken: `tok-${tag}-secret`,
      companyId,
      customerId: customer.id,
      service: "s",
      customerName: "Customer",
      phone: "01012345678",
      district: "R7",
      budget: "b",
      description: "d",
    },
  });
  leadId = lead.id;

  staffEmail = `${tag}-admin@example.com`;
  const staff = await prisma.user.create({
    data: {
      email: staffEmail,
      name: "Admin",
      passwordHash: await hashPassword(PASSWORD),
      role: "ADMIN",
    },
  });
  staffToken = await signToken({ sub: staff.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { conversation: { leadId } } });
  await prisma.conversation.deleteMany({ where: { leadId } });
  await prisma.lead.deleteMany({ where: { companyId } });
  await prisma.customerUser.deleteMany({ where: { email: EMAIL } });
  await prisma.user.deleteMany({ where: { email: staffEmail } });
  await prisma.companyCategory.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

async function signIn(): Promise<string> {
  const res = await customerLoginPOST(
    req({
      url: "/api/auth/customer/login",
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
    }),
  );
  expect(res.status).toBe(200);
  const cookie = setCookies(res).get(CUSTOMER_SESSION_COOKIE);
  expect(cookie, "sign-in must set the customer session cookie").toBeDefined();
  return cookie!.value;
}

describe("the session survives", () => {
  it("signs in on the CUSTOMER cookie, not the staff one", async () => {
    const res = await customerLoginPOST(
      req({
        url: "/api/auth/customer/login",
        method: "POST",
        body: { email: EMAIL, password: PASSWORD },
      }),
    );
    const jar = setCookies(res);
    expect(jar.has(CUSTOMER_SESSION_COOKIE)).toBe(true);
    // The bug: this used to be the cookie it landed in, evicting any staff session.
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("coexists with a staff session in the same browser", async () => {
    // One jar, both populations — the case that used to be impossible.
    const jar = { [SESSION_COOKIE]: staffToken, [CUSTOMER_SESSION_COOKIE]: await signIn() };

    const asCustomer = await meGET(req({ url: "/api/customer/me", cookies: jar }), undefined);
    expect(asCustomer.status).toBe(200);
    expect(await asCustomer.json()).toMatchObject({ email: EMAIL });

    const asStaff = await authMeGET(req({ url: "/api/auth/me", cookies: jar }), undefined);
    expect(asStaff.status).toBe(200);
    expect(await asStaff.json()).toMatchObject({ role: "ADMIN" });
  });

  it("is RENEWED by /customer/me, so an active customer is never timed out", async () => {
    const res = await meGET(
      req({ url: "/api/customer/me", cookies: { [CUSTOMER_SESSION_COOKIE]: await signIn() } }),
      undefined,
    );
    const renewed = setCookies(res).get(CUSTOMER_SESSION_COOKIE);
    expect(renewed).toBeDefined();
    // A full-length window again, not whatever was left of the old one.
    expect(renewed!.maxAge).toBeGreaterThan(0);
  });

  it("still accepts a session left in the LEGACY shared cookie", async () => {
    // Sessions opened before the split live there; dropping them would have
    // signed out every customer on the deploy that fixed this.
    const res = await meGET(
      req({ url: "/api/customer/me", cookies: { [SESSION_COOKIE]: await signIn() } }),
      undefined,
    );
    expect(res.status).toBe(200);
  });

  it("logging out clears the customer cookie and leaves the staff one alone", async () => {
    const res = await customerLogoutPOST(
      req({
        url: "/api/auth/customer/logout",
        method: "POST",
        cookies: { [SESSION_COOKIE]: staffToken, [CUSTOMER_SESSION_COOKIE]: await signIn() },
      }),
    );
    const jar = setCookies(res);
    expect(jar.get(CUSTOMER_SESSION_COOKIE)?.maxAge).toBe(0);
    // The admin in the same browser stays signed in.
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("old requests and chats load after signing in", () => {
  it("the account's requests come back without any device-held secret", async () => {
    const res = await accountLeadsGET(
      req({ url: "/api/customer/leads", cookies: { [CUSTOMER_SESSION_COOKIE]: await signIn() } }),
      undefined,
    );
    expect(res.status).toBe(200);
    const leads = (await res.json()) as { refNumber: string; trackingToken?: string }[];
    expect(leads.map((l) => l.refNumber)).toContain(refNumber);
    // And deliberately WITHOUT the token — which is the whole reason the
    // account chat routes have to exist.
    expect(leads[0]!.trackingToken).toBeUndefined();
  });

  it("the anonymous chat gate CANNOT open that thread — the case the site used to hit", async () => {
    // No token to send (the account route never returned one) and the phone
    // fallback is refused for a lead that has a token stored. 404.
    const headers = new Headers({
      "x-lead-phone": "01012345678",
      "x-forwarded-for": "10.20.30.56",
    });
    const res = await anonThreadGET(
      new NextRequest(`http://localhost/api/chat?ref=${encodeURIComponent(refNumber)}`, {
        headers,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("the account gate opens it, lists it, and carries a message", async () => {
    const cookies = { [CUSTOMER_SESSION_COOKIE]: await signIn() };

    const thread = await accountThreadGET(
      req({ url: `/api/customer/leads/${leadId}/messages`, cookies }),
      ctx({ id: leadId }),
    );
    expect(thread.status).toBe(200);

    const sent = await accountSendPOST(
      req({
        url: `/api/customer/leads/${leadId}/messages`,
        method: "POST",
        body: { body: "Where is my request?" },
        cookies,
      }),
      ctx({ id: leadId }),
    );
    expect(sent.status).toBe(201);

    const summaries = await accountSummariesGET(
      req({ url: "/api/customer/chat/summaries", cookies }),
      undefined,
    );
    expect(summaries.status).toBe(200);
    const rows = (await summaries.json()) as {
      refNumber: string;
      lastMessagePreview: string | null;
    }[];
    const mine = rows.find((r) => r.refNumber === refNumber);
    expect(mine, "the account's thread must appear in its own summaries").toBeDefined();
    expect(mine!.lastMessagePreview).toContain("Where is my request?");
  });
});
