import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withErrors, safeRoute } from "@/lib/utils/withErrors";
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

  // The reporting path used to pass `req.url` straight through, so a 500 on
  // /api/leads/track shipped that lead's trackingToken — a bearer credential for
  // the request, its chat thread and its price verification — to Sentry AND the
  // server log. Asserted at the console boundary because that is the same value
  // captureException forwards.
  it("never logs a tracking token or phone number from the request URL", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let receivedUrl = "";
    const handler = withErrors(async (req: { url: string }) => {
      receivedUrl = req.url;
      throw new Error("boom");
    });

    await handler({
      url: "https://alassema.com/api/leads/track?ref=AA-20260826-7F3K&token=SUPERSECRETTOKEN",
    });

    // Precondition: the handler really is handed the secret, so the assertions
    // below are testing redaction rather than an absence that was never there.
    expect(receivedUrl).toContain("SUPERSECRETTOKEN");

    const logged = errSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("SUPERSECRETTOKEN");
    expect(logged).not.toContain("AA-20260826-7F3K");
    // Still useful: the path and the parameter NAMES survive.
    expect(logged).toContain("/api/leads/track");
    errSpy.mockRestore();
  });
});

describe("safeRoute", () => {
  it("redacts credential-bearing query values but keeps path and parameter names", () => {
    expect(
      safeRoute("https://alassema.com/api/leads/track?ref=AA-1&token=SECRET"),
    ).toBe("/api/leads/track?ref=%5Bredacted%5D&token=%5Bredacted%5D");
  });

  it("redacts the waitlist phone lookup", () => {
    const out = safeRoute("https://alassema.com/api/waitlist/track?id=abc&phone=%2B201012345678");
    expect(out).not.toContain("201012345678");
    expect(out).toContain("/api/waitlist/track");
  });

  it("is case-insensitive about parameter names", () => {
    expect(safeRoute("https://x.test/api/y?TOKEN=SECRET")).not.toContain("SECRET");
  });

  it("leaves harmless parameters readable", () => {
    expect(safeRoute("https://x.test/api/companies?page=2&search=paint")).toBe(
      "/api/companies?page=2&search=paint",
    );
  });

  it("drops the query entirely when the URL cannot be parsed", () => {
    expect(safeRoute("/api/leads/track?token=SECRET")).toBe("/api/leads/track");
    expect(safeRoute("not a url at all?token=SECRET")).toBe("not a url at all");
  });

  it("passes undefined through", () => {
    expect(safeRoute(undefined)).toBeUndefined();
  });
});
