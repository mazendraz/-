// Tests for the API edge gate (CORS + optional X-Api-Key). This is security
// ingress with no runtime coverage otherwise: a refactor here could silently turn
// deny-by-default into allow-all, and nothing would notice. These lock the
// invariants down.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { canonicalApiPath, proxy, resolveAllowedOrigin } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(
  path: string,
  opts: {
    method?: string;
    origin?: string;
    apiKey?: string;
    contentLength?: number;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.apiKey !== undefined) headers.set("x-api-key", opts.apiKey);
  if (opts.contentLength !== undefined) {
    headers.set("content-length", String(opts.contentLength));
  }
  return new NextRequest(`http://localhost${path}`, {
    method: opts.method ?? "GET",
    headers,
  });
}

describe("resolveAllowedOrigin", () => {
  it("reflects an allowlisted origin and denies others when an allowlist is set", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://alassema.com, https://www.alassema.com");
    expect(resolveAllowedOrigin("https://alassema.com")).toBe("https://alassema.com");
    expect(resolveAllowedOrigin("https://evil.example")).toBeNull();
  });

  it("DENIES by default in production when no allowlist is configured", () => {
    // The load-bearing security invariant: a missing CORS_ALLOWED_ORIGINS must not
    // silently expose the API to every origin in production.
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveAllowedOrigin("https://evil.example")).toBeNull();
  });

  it("reflects any origin in development for convenience when no allowlist is set", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveAllowedOrigin("https://localhost:5173")).toBe("https://localhost:5173");
    expect(resolveAllowedOrigin("")).toBe("*");
  });
});

describe("proxy — CORS", () => {
  it("answers a preflight for an allowlisted origin with 204 + CORS headers", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://alassema.com");
    const res = await proxy(req("/api/leads", { method: "OPTIONS", origin: "https://alassema.com" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://alassema.com");
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("preflight from a non-allowlisted origin gets no Allow-Origin header", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://alassema.com");
    const res = await proxy(req("/api/leads", { method: "OPTIONS", origin: "https://evil.example" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("a simple request from an allowlisted origin passes through with CORS headers", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://alassema.com");
    const res = await proxy(req("/api/companies", { origin: "https://alassema.com" }));
    expect(res.status).not.toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://alassema.com");
  });

  it("allows credentials when reflecting a specific origin (cookie auth cross-origin)", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://alassema.com");
    const res = await proxy(req("/api/companies", { origin: "https://alassema.com" }));
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("never sends credentials with the '*' wildcard (dev, no Origin)", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "development");
    const res = await proxy(req("/api/companies")); // no Origin header → "*"
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("proxy — API-key gate", () => {
  it("blocks a request with a missing/wrong key with 401 when API_KEY is set", async () => {
    vi.stubEnv("API_KEY", "s3cret-key");
    const missing = await proxy(req("/api/leads"));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const wrong = await proxy(req("/api/leads", { apiKey: "wrong" }));
    expect(wrong.status).toBe(401);
  });

  it("allows a request with the correct key", async () => {
    vi.stubEnv("API_KEY", "s3cret-key");
    const res = await proxy(req("/api/leads", { apiKey: "s3cret-key" }));
    expect(res.status).not.toBe(401);
  });

  it("exempts the health/ready/sitemap probes from the key gate", async () => {
    vi.stubEnv("API_KEY", "s3cret-key");
    for (const p of ["/api/health", "/api/ready", "/api/sitemap"]) {
      const res = await proxy(req(p));
      expect(res.status, `${p} should be exempt`).not.toBe(401);
    }
  });

  it("applies no gate when API_KEY is unset", async () => {
    vi.stubEnv("API_KEY", "");
    const res = await proxy(req("/api/leads"));
    expect(res.status).not.toBe(401);
  });
});

// The mobile apps call /api/v1/*, which next.config.ts rewrites to /api/*. That
// rewrite runs AFTER this proxy, so everything here sees the "/v1" segment the
// route handler never will. These lock down that the two path-matching gates
// keep working on the versioned path — a regression in either is silent and
// only shows up as a 413 on video upload or a 401 on an uptime probe.
describe("proxy — /api/v1 version prefix", () => {
  describe("canonicalApiPath", () => {
    it("strips the version segment", () => {
      expect(canonicalApiPath("/api/v1/provider/upload")).toBe("/api/provider/upload");
      expect(canonicalApiPath("/api/v1/health")).toBe("/api/health");
      expect(canonicalApiPath("/api/v2/companies")).toBe("/api/companies");
    });

    it("leaves unversioned paths untouched", () => {
      expect(canonicalApiPath("/api/provider/upload")).toBe("/api/provider/upload");
      expect(canonicalApiPath("/api/companies")).toBe("/api/companies");
    });

    it("only strips a whole segment, never a prefix of a longer one", () => {
      // "/api/v1beta/..." is not version 1 — matching it would silently reroute
      // a real (if oddly named) route to a different handler.
      expect(canonicalApiPath("/api/v1beta/companies")).toBe("/api/v1beta/companies");
      expect(canonicalApiPath("/api/version/companies")).toBe("/api/version/companies");
    });

    it("handles the bare version root", () => {
      expect(canonicalApiPath("/api/v1")).toBe("/api");
    });
  });

  it("exempts the versioned probes from the API-key gate", async () => {
    vi.stubEnv("API_KEY", "s3cret-key");
    for (const p of ["/api/v1/health", "/api/v1/ready", "/api/v1/sitemap"]) {
      const res = await proxy(req(p));
      expect(res.status, `${p} should be exempt`).not.toBe(401);
    }
  });

  it("still gates a versioned non-probe route", async () => {
    vi.stubEnv("API_KEY", "s3cret-key");
    const res = await proxy(req("/api/v1/leads"));
    expect(res.status).toBe(401);
  });

  it("lets a versioned upload carry a body above the 1MB JSON ceiling", async () => {
    // A gallery video is up to 50MB and is capped by content in upload.service,
    // not here. Before the path was normalized this returned 413 on /api/v1.
    const res = await proxy(
      req("/api/v1/provider/upload", { method: "POST", contentLength: 20 * 1024 * 1024 }),
    );
    expect(res.status).not.toBe(413);
  });

  it("still sheds an oversized body on a versioned non-upload route", async () => {
    const res = await proxy(
      req("/api/v1/provider/change-requests", {
        method: "POST",
        contentLength: 20 * 1024 * 1024,
      }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
