// GET /customer/me was an indefinite token-extension oracle.
//
// It re-minted a full-TTL session token for ANY caller presenting a valid one,
// and delivered it as a Set-Cookie header. That is fine for a browser — it is
// what makes the website's session slide — but the Authorization header is tried
// FIRST when resolving a caller (auth.ts resolveTokens), so anybody holding a
// captured access token could call this once a day with a Bearer header, read
// the fresh JWT out of Set-Cookie, and keep an account open forever. It survived
// sign-out, "sign out this device", "sign out everywhere" and a password reset,
// because each of those revokes a CustomerSession row and none of them can
// recall a stateless JWT.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const customerRow = {
  id: "cust-1",
  name: "عميل",
  email: "customer@example.com",
  avatarUrl: null,
  emailVerified: true,
  isActive: true,
  tokensValidFrom: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerUser: { findUnique: async () => customerRow },
    customerSession: { findUnique: async () => null },
  },
}));

const { signCustomerToken, CUSTOMER_SESSION_COOKIE } = await import("@/lib/auth");
const { GET } = await import("@/app/api/customer/me/route");

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-vitest";
});

const URL_ = "http://localhost/api/v1/customer/me";

function setCookieHeader(res: Response): string | null {
  return res.headers.get("set-cookie");
}

describe("GET /customer/me — renewal is cookie-only", () => {
  it("does NOT hand a fresh token back to a Bearer caller", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    const res = await GET(
      new NextRequest(URL_, { headers: new Headers({ authorization: `Bearer ${token}` }) }),
      {} as never,
    );

    expect(res.status).toBe(200);
    // The whole finding in one assertion: no renewed credential comes back, so
    // a captured token simply runs out instead of extending itself.
    expect(setCookieHeader(res)).toBeNull();
  });

  it("still slides the session for a browser (cookie caller)", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    const res = await GET(
      new NextRequest(URL_, {
        headers: new Headers({ cookie: `${CUSTOMER_SESSION_COOKIE}=${token}` }),
      }),
      {} as never,
    );

    expect(res.status).toBe(200);
    const cookie = setCookieHeader(res);
    expect(cookie).toContain(CUSTOMER_SESSION_COOKIE);
    expect(cookie).toContain("HttpOnly");
  });

  // A mobile client sends a Bearer header; it may also be carrying a cookie it
  // was handed at sign-in and has no jar for. The Bearer header is what actually
  // authenticated it, so it is a Bearer caller — the presence of a cookie must
  // not reopen the oracle.
  it("treats a request with BOTH a bearer header and a cookie as a bearer caller", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    const res = await GET(
      new NextRequest(URL_, {
        headers: new Headers({
          authorization: `Bearer ${token}`,
          cookie: `${CUSTOMER_SESSION_COOKIE}=${token}`,
        }),
      }),
      {} as never,
    );

    expect(setCookieHeader(res)).toBeNull();
  });

  it("returns the customer either way", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    const res = await GET(
      new NextRequest(URL_, { headers: new Headers({ authorization: `Bearer ${token}` }) }),
      {} as never,
    );
    expect(await res.json()).toMatchObject({ id: "cust-1", email: "customer@example.com" });
  });
});
