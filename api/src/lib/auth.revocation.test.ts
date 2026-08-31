// Session revocation, which used to be unenforceable.
//
// The access token in this system is a stateless JWT. Nothing about it could be
// recalled once signed, and `isActive` — an account-level kill switch — was the
// only lever that existed. Everything in between was cosmetic:
//
//   * "Sign out this device" revoked a CustomerSession row, i.e. the REFRESH
//     token. The access token minted from it kept working.
//   * "Sign out everywhere" did the same thing N times, with the same gap.
//   * A password reset (customer) or password change (staff) likewise.
//   * And GET /customer/me re-minted a full-TTL token for ANY caller holding a
//     valid one, so a captured token could be renewed daily, forever, surviving
//     every one of the above.
//
// Two mechanisms close it, and this file is what will notice if either regresses:
// the `sid` claim (per-device) and `tokensValidFrom` (per-account floor).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

interface SessionRow {
  id: string;
  customerId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

interface StaffSessionRow {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

const HOUR = 3_600_000;

let staffRow: Record<string, unknown>;
let customerRow: Record<string, unknown>;
let sessions: Record<string, SessionRow>;
let staffSessions: Record<string, StaffSessionRow>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => staffRow },
    customerUser: { findUnique: async () => customerRow },
    customerSession: {
      findUnique: async ({ where }: { where: { id: string } }) => sessions[where.id] ?? null,
    },
    staffSession: {
      findUnique: async ({ where }: { where: { id: string } }) => staffSessions[where.id] ?? null,
    },
  },
}));

const { signToken, signCustomerToken, getAuthUser, getCustomerUser } = await import("@/lib/auth");

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-vitest";
});

beforeEach(() => {
  staffRow = {
    id: "staff-1",
    name: "Admin",
    email: "admin@alassema.com",
    role: "ADMIN",
    companyId: null,
    isActive: true,
    desktopPermissions: [],
    tokensValidFrom: null,
  };
  customerRow = {
    id: "cust-1",
    name: "عميل",
    email: "customer@example.com",
    avatarUrl: null,
    emailVerified: true,
    isActive: true,
    tokensValidFrom: null,
  };
  sessions = {
    "sess-1": {
      id: "sess-1",
      customerId: "cust-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * HOUR),
    },
  };
  staffSessions = {
    "staff-sess-1": {
      id: "staff-sess-1",
      userId: "staff-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * HOUR),
    },
  };
});

function bearer(token: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/customer/me", {
    headers: new Headers({ authorization: `Bearer ${token}` }),
  });
}

describe("per-device revocation via the sid claim", () => {
  it("accepts a token whose session is live", async () => {
    const token = await signCustomerToken({ sub: "cust-1", sid: "sess-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toMatchObject({ id: "cust-1" });
  });

  // The mobile half of H-01: revoking one phone killed its refresh token and
  // left the access token working until it expired.
  it("refuses the access token the moment its session is revoked", async () => {
    const token = await signCustomerToken({ sub: "cust-1", sid: "sess-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toBeTruthy();

    sessions["sess-1"]!.revokedAt = new Date();

    await expect(getCustomerUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  it("refuses a token whose session has expired", async () => {
    sessions["sess-1"]!.expiresAt = new Date(Date.now() - HOUR);
    const token = await signCustomerToken({ sub: "cust-1", sid: "sess-1" });
    await expect(getCustomerUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  it("refuses a token naming a session that does not exist", async () => {
    const token = await signCustomerToken({ sub: "cust-1", sid: "sess-does-not-exist" });
    await expect(getCustomerUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  // A hand-edited token pointing at somebody else's live session must not
  // borrow it — the subject and the session have to agree.
  it("refuses a session belonging to a different customer", async () => {
    sessions["sess-other"] = {
      id: "sess-other",
      customerId: "cust-2",
      revokedAt: null,
      expiresAt: new Date(Date.now() + HOUR),
    };
    const token = await signCustomerToken({ sub: "cust-1", sid: "sess-other" });
    await expect(getCustomerUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  // The website has no session row — its credential is the httpOnly cookie and
  // its revocation story is the account floor below. A token with no `sid` must
  // keep working, or this change signs every browser out.
  it("still accepts a token with no sid at all", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toMatchObject({ id: "cust-1" });
  });
});

describe("account-wide floor — customers", () => {
  it("refuses every token issued before the floor", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toBeTruthy();

    // "Sign out everywhere", or a password reset.
    customerRow.tokensValidFrom = new Date(Date.now() + 5_000);

    await expect(getCustomerUser(bearer(token))).rejects.toThrow(/inactive or no longer exists/i);
  });

  it("accepts a token issued after the floor", async () => {
    customerRow.tokensValidFrom = new Date(Date.now() - HOUR);
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toMatchObject({ id: "cust-1" });
  });

  // The floor is set, then the customer is signed straight back in — that is
  // what resetPassword does. Both happen inside one second, and `iat` has only
  // second resolution, so a strict comparison would sign them out of the
  // session they just created.
  it("accepts a token minted in the same second the floor was set", async () => {
    customerRow.tokensValidFrom = new Date();
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toMatchObject({ id: "cust-1" });
  });

  it("leaves everything alone when no floor is set", async () => {
    customerRow.tokensValidFrom = null;
    const token = await signCustomerToken({ sub: "cust-1" });
    await expect(getCustomerUser(bearer(token))).resolves.toBeTruthy();
  });
});

// Staff (Business App) mirror of "per-device revocation via the sid claim"
// above. Phase 0 of the mobile plan: staff had no equivalent of this at all —
// only the account-wide isActive/tokensValidFrom floor, which meant "sign out
// this one lost phone" required deactivating the whole account.
describe("per-device revocation via the sid claim — staff", () => {
  it("accepts a token whose session is live", async () => {
    const token = await signToken({
      sub: "staff-1",
      role: "ADMIN",
      companyId: null,
      sid: "staff-sess-1",
    });
    await expect(getAuthUser(bearer(token))).resolves.toMatchObject({ id: "staff-1" });
  });

  it("refuses the access token the moment its session is revoked", async () => {
    const token = await signToken({
      sub: "staff-1",
      role: "ADMIN",
      companyId: null,
      sid: "staff-sess-1",
    });
    await expect(getAuthUser(bearer(token))).resolves.toBeTruthy();

    staffSessions["staff-sess-1"]!.revokedAt = new Date();

    await expect(getAuthUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  it("refuses a token whose session has expired", async () => {
    staffSessions["staff-sess-1"]!.expiresAt = new Date(Date.now() - HOUR);
    const token = await signToken({
      sub: "staff-1",
      role: "ADMIN",
      companyId: null,
      sid: "staff-sess-1",
    });
    await expect(getAuthUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  it("refuses a token naming a session that does not exist", async () => {
    const token = await signToken({
      sub: "staff-1",
      role: "ADMIN",
      companyId: null,
      sid: "staff-sess-does-not-exist",
    });
    await expect(getAuthUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  // A hand-edited token pointing at somebody else's live session must not
  // borrow it — the subject and the session have to agree.
  it("refuses a session belonging to a different staff account", async () => {
    staffSessions["staff-sess-other"] = {
      id: "staff-sess-other",
      userId: "staff-2",
      revokedAt: null,
      expiresAt: new Date(Date.now() + HOUR),
    };
    const token = await signToken({
      sub: "staff-1",
      role: "ADMIN",
      companyId: null,
      sid: "staff-sess-other",
    });
    await expect(getAuthUser(bearer(token))).rejects.toThrow(/sign in again/i);
  });

  // The web dashboard has no session row — its credential is the httpOnly
  // cookie and its revocation story is the account floor below. A token with
  // no `sid` at all (every token minted by the website, and every token
  // minted before this feature existed) must keep working unchanged, or this
  // change signs every admin and provider out of the web dashboard.
  it("still accepts a token with no sid at all — the website's shape, unchanged", async () => {
    const token = await signToken({ sub: "staff-1", role: "ADMIN", companyId: null });
    await expect(getAuthUser(bearer(token))).resolves.toMatchObject({ id: "staff-1" });
  });
});

describe("account-wide floor — staff", () => {
  // PATCH /api/auth/password used to say outright: "Other sessions are NOT
  // revoked — there is no token denylist."
  it("refuses a staff token issued before a password change", async () => {
    const token = await signToken({ sub: "staff-1", role: "ADMIN", companyId: null });
    await expect(getAuthUser(bearer(token))).resolves.toBeTruthy();

    staffRow.tokensValidFrom = new Date(Date.now() + 5_000);

    await expect(getAuthUser(bearer(token))).rejects.toThrow(/inactive or no longer exists/i);
  });

  // A staff token carries `role` as a CLAIM, and withRole reads that claim, not
  // the row. Demoting an ADMIN therefore has to end their tokens — otherwise
  // the privilege survives in whatever tab is still open.
  it("refuses a token minted while the account was still an ADMIN", async () => {
    const adminToken = await signToken({ sub: "staff-1", role: "ADMIN", companyId: null });

    staffRow.role = "PROVIDER";
    staffRow.tokensValidFrom = new Date(Date.now() + 5_000);

    await expect(getAuthUser(bearer(adminToken))).rejects.toThrow(/inactive or no longer exists/i);
  });

  it("accepts a staff token issued after the floor", async () => {
    staffRow.tokensValidFrom = new Date(Date.now() - HOUR);
    const token = await signToken({ sub: "staff-1", role: "ADMIN", companyId: null });
    await expect(getAuthUser(bearer(token))).resolves.toMatchObject({ role: "ADMIN" });
  });
});

describe("the failure message gives nothing away", () => {
  it("says the same thing for a floored token as for a deactivated account", async () => {
    const token = await signCustomerToken({ sub: "cust-1" });

    customerRow.tokensValidFrom = new Date(Date.now() + 5_000);
    const floored = await getCustomerUser(bearer(token)).catch((e: Error) => e.message);

    customerRow.tokensValidFrom = null;
    customerRow.isActive = false;
    const inactive = await getCustomerUser(bearer(token)).catch((e: Error) => e.message);

    expect(floored).toBe(inactive);
  });
});
