// The staff (Business App) refresh-session model, end to end against real
// routes. Mirrors customerSession.int.test.ts's approach — real handlers, real
// Postgres — but focused on the one thing that is new here: a mobile login
// that survives longer than a day and can be revoked per device, without
// changing anything about how the WEBSITE signs in.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, hashPassword } from "@/lib/auth";

import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as refreshPOST } from "@/app/api/auth/refresh/route";
import { GET as meGET } from "@/app/api/auth/me/route";
import { GET as sessionsGET, POST as sessionsPOST } from "@/app/api/auth/sessions/route";

const tag = `ssession-${Date.now()}`;
const EMAIL = `${tag}@example.com`;
const PASSWORD = "Str0ng-Passw0rd!x";

let userId = "";

function req(
  opts: {
    url?: string;
    method?: string;
    body?: unknown;
    cookies?: Record<string, string>;
    bearer?: string;
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
  if (opts.bearer) headers.set("authorization", `Bearer ${opts.bearer}`);
  headers.set("x-forwarded-for", opts.ip ?? "10.20.30.60");
  return new NextRequest(`http://localhost${opts.url ?? "/api/auth/me"}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

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
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Staff",
      passwordHash: await hashPassword(PASSWORD),
      role: "PROVIDER",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.staffSession.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

interface LoginBody {
  token: string;
  refreshToken?: string;
  user: { id: string; role: string };
}

// Every call needs its own IP: POST /auth/login is rate-limited at 10/min per
// IP, and this file logs in far more than 10 times across its tests. A shared
// fake IP would trip that limiter and fail on a real safety feature, not a
// bug — so each call gets its own address instead of disabling the limiter.
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

async function loginWebsite(): Promise<LoginBody> {
  const res = await loginPOST(
    req({
      url: "/api/auth/login",
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
      ip: freshIp(),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as LoginBody;
}

async function loginMobile(device: { deviceName?: string; platform?: "ios" | "android" } = {}) {
  const res = await loginPOST(
    req({
      url: "/api/auth/login",
      method: "POST",
      body: { email: EMAIL, password: PASSWORD, device: { platform: "ios", ...device } },
      ip: freshIp(),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as LoginBody;
}

describe("the website's login is unchanged", () => {
  it("returns no refreshToken when no device is sent", async () => {
    const body = await loginWebsite();
    expect(body.token).toBeTruthy();
    expect(body.refreshToken).toBeUndefined();
  });

  it("still sets the httpOnly staff cookie", async () => {
    const res = await loginPOST(
      req({
        url: "/api/auth/login",
        method: "POST",
        body: { email: EMAIL, password: PASSWORD },
      }),
    );
    expect(setCookies(res).has(SESSION_COOKIE)).toBe(true);
  });

  it("creates no StaffSession row", async () => {
    const before = await prisma.staffSession.count({ where: { userId } });
    await loginWebsite();
    const after = await prisma.staffSession.count({ where: { userId } });
    expect(after).toBe(before);
  });
});

describe("a mobile (device) login", () => {
  it("returns a refreshToken and creates a session row", async () => {
    const before = await prisma.staffSession.count({ where: { userId } });
    const body = await loginMobile({ deviceName: "iPhone" });
    expect(body.refreshToken).toBeTruthy();
    const after = await prisma.staffSession.count({ where: { userId } });
    expect(after).toBe(before + 1);
  });

  it("mints an access token that works immediately", async () => {
    const { token } = await loginMobile();
    const res = await meGET(req({ url: "/api/auth/me", bearer: token }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: userId, role: "PROVIDER" });
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and returns a working access token", async () => {
    const first = await loginMobile();
    const res = await refreshPOST(
      req({ url: "/api/auth/refresh", method: "POST", body: { refreshToken: first.refreshToken } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginBody;
    expect(body.refreshToken).toBeTruthy();
    // The REFRESH token always rotates. The access token is a deterministic
    // function of the same claims (sub/role/companyId/sid) plus a
    // second-resolution `iat` — rotation doesn't create a new session row,
    // so a refresh landing in the same wall-clock second as the login can
    // legitimately produce byte-identical JWTs. What matters is that it
    // authenticates, not that its bytes differ.
    expect(body.refreshToken).not.toBe(first.refreshToken);

    const me = await meGET(req({ url: "/api/auth/me", bearer: body.token }), undefined);
    expect(me.status).toBe(200);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await refreshPOST(
      req({ url: "/api/auth/refresh", method: "POST", body: { refreshToken: "not-a-real-token" } }),
    );
    expect(res.status).toBe(401);
  });

  it("is reachable with an EXPIRED access token — the whole point", async () => {
    // refresh doesn't even look at the access token; the body's refresh
    // token is the only credential. Simulate an app whose access token has
    // long since expired by simply not sending one at all.
    const { refreshToken } = await loginMobile();
    const res = await refreshPOST(
      req({ url: "/api/auth/refresh", method: "POST", body: { refreshToken } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("GET/POST /auth/sessions", () => {
  it("lists the account's live devices", async () => {
    const { token } = await loginMobile({ deviceName: "Test Device" });
    const res = await sessionsGET(req({ url: "/api/auth/sessions", bearer: token }), undefined);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; deviceName: string | null }[];
    expect(list.some((s) => s.deviceName === "Test Device")).toBe(true);
  });

  it("revoking a session by id ends only that device, and its access token dies on the next request", async () => {
    const a = await loginMobile({ deviceName: "phone" });
    const b = await loginMobile({ deviceName: "tablet" });

    const list = (await (
      await sessionsGET(req({ url: "/api/auth/sessions", bearer: a.token }), undefined)
    ).json()) as { id: string; deviceName: string | null }[];
    const phoneSession = list.find((s) => s.deviceName === "phone");
    expect(phoneSession).toBeDefined();

    const revokeRes = await sessionsPOST(
      req({
        url: "/api/auth/sessions",
        method: "POST",
        bearer: a.token,
        body: { sessionId: phoneSession!.id },
      }),
      undefined,
    );
    expect(revokeRes.status).toBe(200);

    // The revoked device's ACCESS token — not just the refresh token — is
    // dead on its very next request. This is the whole reason the sid claim
    // exists: without it, revoking a device only killed the refresh token
    // and left the access token working until it expired on its own.
    const afterRevoke = await meGET(req({ url: "/api/auth/me", bearer: a.token }), undefined);
    expect(afterRevoke.status).toBe(401);

    // The other device is untouched.
    const stillWorks = await meGET(req({ url: "/api/auth/me", bearer: b.token }), undefined);
    expect(stillWorks.status).toBe(200);
  });

  it("an empty body revokes every session — sign out everywhere", async () => {
    await loginMobile();
    await loginMobile();
    const { token: latest } = await loginMobile();

    const res = await sessionsPOST(
      req({ url: "/api/auth/sessions", method: "POST", bearer: latest, body: {} }),
      undefined,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revoked: number };
    expect(body.revoked).toBeGreaterThanOrEqual(3);

    // Including the very session that made the call.
    const after = await meGET(req({ url: "/api/auth/me", bearer: latest }), undefined);
    expect(after.status).toBe(401);
  });
});

describe("POST /auth/logout with a refreshToken", () => {
  it("revokes the device session so its refresh token stops working", async () => {
    const { refreshToken } = await loginMobile();

    const res = await logoutPOST(
      req({ url: "/api/auth/logout", method: "POST", body: { refreshToken } }),
    );
    expect(res.status).toBe(204);

    const refreshAfter = await refreshPOST(
      req({ url: "/api/auth/refresh", method: "POST", body: { refreshToken } }),
    );
    expect(refreshAfter.status).toBe(401);
  });

  it("still clears the cookie with no body at all — the website's shape", async () => {
    const res = await logoutPOST(req({ url: "/api/auth/logout", method: "POST" }));
    expect(res.status).toBe(204);
    expect(setCookies(res).get(SESSION_COOKIE)?.maxAge).toBe(0);
  });
});
