import { describe, expect, it } from "vitest";
import { assertOwnership, withRole } from "@/lib/middleware/withRole";
import { ForbiddenError } from "@/lib/utils/errors";
import type { AuthUser } from "@/lib/auth";

const admin: AuthUser = {
  id: "a",
  name: "Admin",
  email: "a@test",
  role: "ADMIN",
  companyId: null,
};
const provider: AuthUser = {
  id: "p",
  name: "Prov",
  email: "p@test",
  role: "PROVIDER",
  companyId: "co-1",
};

const req = new Request("http://x/test") as never;
const ctx = {} as never;
const handler = async () => Response.json({ reached: true });

describe("withRole", () => {
  it("invokes the handler when the role matches", async () => {
    const res = await withRole("ADMIN", handler)(req, ctx, admin);
    expect(await res.json()).toEqual({ reached: true });
  });

  it("throws ForbiddenError when the role does not match", () => {
    // withRole throws synchronously before delegating to the handler.
    expect(() => withRole("ADMIN", handler)(req, ctx, provider)).toThrow(
      ForbiddenError,
    );
  });
});

describe("assertOwnership", () => {
  it("lets admins access any resource", () => {
    expect(() => assertOwnership(admin, "co-anything")).not.toThrow();
  });

  it("lets a provider access their own company's resource", () => {
    expect(() => assertOwnership(provider, "co-1")).not.toThrow();
  });

  it("blocks a provider from another company's resource", () => {
    expect(() => assertOwnership(provider, "co-2")).toThrow(ForbiddenError);
  });

  it("blocks a provider with no company", () => {
    expect(() => assertOwnership({ ...provider, companyId: null }, "co-1")).toThrow(
      ForbiddenError,
    );
  });
});
