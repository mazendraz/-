import { describe, expect, it } from "vitest";
import { fail, ok, page } from "@/lib/utils/response";

describe("ok", () => {
  it("returns the raw object with no envelope", async () => {
    const res = ok({ id: "co-1", slug: "aura" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "co-1", slug: "aura" });
  });

  it("honors a custom status (e.g. 201)", () => {
    expect(ok({ id: "lead-1" }, 201).status).toBe(201);
  });
});

describe("page", () => {
  it("wraps data in { data, meta } with total/page/pageSize", async () => {
    const res = page([{ id: "1" }, { id: "2" }], {
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [{ id: "1" }, { id: "2" }],
      meta: { total: 2, page: 1, pageSize: 20 },
    });
  });
});

describe("fail", () => {
  it("returns a flat { code, message } with the given status", async () => {
    const res = fail("NOT_FOUND", "Company not found", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "NOT_FOUND",
      message: "Company not found",
    });
  });

  it("includes details only when provided", async () => {
    const res = fail("VALIDATION_ERROR", "Validation failed", 400, {
      phone: ["Invalid Egyptian mobile number"],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: { phone: ["Invalid Egyptian mobile number"] },
    });
  });
});
