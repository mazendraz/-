import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { MAX_PUBLIC_BODY_BYTES, readJsonObject } from "@/lib/middleware/bodyLimit";
import { PayloadTooLargeError, ValidationError } from "@/lib/utils/errors";

function jsonRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.com/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("readJsonObject", () => {
  it("parses a valid JSON object", async () => {
    const req = jsonRequest(JSON.stringify({ name: "Sara" }));
    await expect(readJsonObject(req)).resolves.toEqual({ name: "Sara" });
  });

  it("rejects a declared Content-Length over the cap (413) before parsing", async () => {
    const req = jsonRequest("{}", { "content-length": String(MAX_PUBLIC_BODY_BYTES + 1) });
    await expect(readJsonObject(req)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it("rejects an actual body over the cap (413) even without Content-Length", async () => {
    const big = JSON.stringify({ x: "a".repeat(MAX_PUBLIC_BODY_BYTES) });
    await expect(readJsonObject(jsonRequest(big))).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it("rejects invalid JSON (400)", async () => {
    await expect(readJsonObject(jsonRequest("not json"))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a JSON array (400 — must be an object)", async () => {
    await expect(readJsonObject(jsonRequest("[1,2,3]"))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects JSON null (400)", async () => {
    await expect(readJsonObject(jsonRequest("null"))).rejects.toBeInstanceOf(ValidationError);
  });
});
