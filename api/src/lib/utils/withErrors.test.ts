import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withErrors } from "@/lib/utils/withErrors";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";

describe("withErrors", () => {
  it("passes through a successful response", async () => {
    const handler = withErrors(async () => Response.json({ ok: true }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serializes an AppError to its code + status", async () => {
    const handler = withErrors(async () => {
      throw new NotFoundError("Company");
    });
    const res = await handler();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "NOT_FOUND",
      message: "Company not found",
    });
  });

  it("maps a ConflictError to 409", async () => {
    const handler = withErrors(async () => {
      throw new ConflictError("Category has companies");
    });
    const res = await handler();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("turns a ZodError into a 400 VALIDATION_ERROR with field details", async () => {
    const schema = z.object({ phone: z.string().min(11) });
    const handler = withErrors(async () => {
      schema.parse({ phone: "123" });
      return Response.json({});
    });
    const res = await handler();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details.phone).toBeDefined();
  });

  it("maps Prisma P2025 to 404 and P2002 to 409", async () => {
    const notFound = withErrors(async () => {
      throw Object.assign(new Error("no row"), { code: "P2025" });
    });
    expect((await notFound()).status).toBe(404);

    const conflict = withErrors(async () => {
      throw Object.assign(new Error("dup"), { code: "P2002" });
    });
    expect((await conflict()).status).toBe(409);
  });

  it("hides unknown errors behind a generic 500 INTERNAL_ERROR", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrors(async () => {
      throw new Error("secret internal detail");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong" });
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
    errSpy.mockRestore();
  });
});
