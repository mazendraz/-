// The staff/customer token boundary.
//
// Two populations hold tokens signed with the SAME secret. A token minted for one
// must never authorize the other, and this file is the only thing that will
// notice if that stops being true.
//
// The database is mocked to return a VALID, ACTIVE row for BOTH lookups. That is
// the point of the setup, not a shortcut: if the boundary depended on "a
// CustomerUser id happens not to exist in the User table", these tests would pass
// while the real protection was absent. With both lookups succeeding, the only
// thing that can reject a cross-audience token is the audience check itself.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const staffRow = {
  id: "staff-1",
  name: "Admin",
  email: "admin@alassema.com",
  role: "ADMIN",
  companyId: null,
  isActive: true,
  desktopPermissions: [],
};

const customerRow = {
  id: "cust-1",
  name: "عميل",
  email: "customer@example.com",
  avatarUrl: null,
  emailVerified: true,
  isActive: true,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => staffRow },
    customerUser: { findUnique: async () => customerRow },
  },
}));

const {
  signToken,
  signCustomerToken,
  getAuthUser,
  getCustomerUser,
  SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
} = await import("@/lib/auth");

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-vitest";
});

function bearer(token: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/customer/me", {
    headers: new Headers({ authorization: `Bearer ${token}` }),
  });
}

/** A request carrying cookies, the way a browser sends them. */
function withCookies(jar: Record<string, string>): NextRequest {
  const cookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest("http://localhost/api/v1/customer/me", {
    headers: new Headers({ cookie }),
  });
}

describe("staff token", () => {
  it("resolves on the staff path", async () => {
    const token = await signToken({ sub: "staff-1", role: "ADMIN", companyId: null });
    await expect(getAuthUser(bearer(token))).resolves.toMatchObject({
      id: "staff-1",
      role: "ADMIN",
    });
  });

  it("is REJECTED on the customer path, even though the customer lookup would succeed", async () => {
    const token = await signToken({ sub: "staff-1", role: "ADMIN", companyId: null });
    await expect(getCustomerUser(bearer(token))).rejects.toThrow(/invalid or expired/i);
  });
});

describe("customer token", () => {
  it("resolves on the customer path", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toMatchObject({
      id: "cust-1",
      email: "customer@example.com",
    });
  });

  it("is REJECTED on the staff path, even though the staff lookup would succeed", async () => {
    // The one that matters most: this is the direction that would hand an
    // ordinary customer an admin session.
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getAuthUser(bearer(token))).rejects.toThrow(/invalid or expired/i);
  });

  it("carries no role, so nothing downstream can read one off it", async () => {
    const customer = await getCustomerUser(bearer(await signCustomerToken({ sub: "cust-1" })));
    expect(customer).not.toHaveProperty("role");
    expect(customer).not.toHaveProperty("companyId");
    expect(customer).not.toHaveProperty("desktopPermissions");
  });
});

describe("legacy tokens with no typ claim", () => {
  it("are accepted as STAFF, so a deploy doesn't 401 everyone signed in", async () => {
    // Every token minted before the claim existed is a staff token. Hand-build one
    // the old way (no typ) and confirm it still resolves.
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ role: "ADMIN", companyId: null })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("staff-1")
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    await expect(getAuthUser(bearer(legacy))).resolves.toMatchObject({ id: "staff-1" });
  });

  it("still cannot reach the customer path", async () => {
    // The fallback widens acceptance in ONE direction only. A token with no typ
    // must never satisfy the customer side — otherwise the fallback would be a
    // way to bypass the boundary by simply omitting a claim.
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("cust-1")
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    await expect(getCustomerUser(bearer(legacy))).rejects.toThrow(/invalid or expired/i);
  });
});


// ── One browser, both populations ───────────────────────────────────────────
// The staff and customer sessions used to share ONE cookie name, so a browser
// could hold only one of them: signing into the dashboard evicted the customer
// session and vice versa, and the evicted side then 401'd on the audience check
// above — which the frontend correctly reads as "signed out". These are the
// tests that keep the two names apart.
describe("staff and customer cookies coexist", () => {
  it("both sessions resolve from the same cookie jar", async () => {
    const jar = {
      [SESSION_COOKIE]: await signToken({ sub: "staff-1", role: "ADMIN", companyId: null }),
      [CUSTOMER_SESSION_COOKIE]: await signCustomerToken({ sub: "cust-1" }),
    };
    await expect(getAuthUser(withCookies(jar))).resolves.toMatchObject({ id: "staff-1" });
    await expect(getCustomerUser(withCookies(jar))).resolves.toMatchObject({ id: "cust-1" });
  });

  it("a staff cookie alone does not produce a customer session", async () => {
    const jar = {
      [SESSION_COOKIE]: await signToken({ sub: "staff-1", role: "ADMIN", companyId: null }),
    };
    await expect(getCustomerUser(withCookies(jar))).rejects.toThrow(/invalid or expired/i);
  });

  it("a customer cookie alone does not produce a staff session", async () => {
    const jar = { [CUSTOMER_SESSION_COOKIE]: await signCustomerToken({ sub: "cust-1" }) };
    await expect(getAuthUser(withCookies(jar))).rejects.toThrow(/invalid or expired|authentication required/i);
  });

  it("a customer token still in the LEGACY shared cookie keeps working", async () => {
    // Sessions opened before the split live there. Dropping them would sign out
    // every signed-in customer on the deploy that fixed this.
    const jar = { [SESSION_COOKIE]: await signCustomerToken({ sub: "cust-1" }) };
    await expect(getCustomerUser(withCookies(jar))).resolves.toMatchObject({ id: "cust-1" });
  });
});
