// CORS for the API. In Next.js 16 the `middleware` convention is renamed to `proxy`.
// Allows the site origin plus the Authorization and X-Api-Key headers the frontend
// client sends (see app/src/lib/api.ts).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Read the allowlist fresh each call (not frozen at import) so behavior is a pure
// function of the current env — this keeps resolveAllowedOrigin unit-testable via
// env stubbing, matching the rateLimitConfigError(env) pattern. Cost is a trivial
// string split per request.
function getAllowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

// Origin-specific CORS headers. When we reflect a specific origin we also allow
// credentials, so the httpOnly session cookie can flow on cross-origin requests
// (the client uses fetch credentials:"include"). Credentials must NEVER pair with
// "*" (browsers reject it), so Allow-Credentials is omitted for the dev wildcard —
// which is only ever returned for a request with no Origin (same-origin), where
// CORS doesn't apply anyway.
function originHeaders(allowOrigin: string): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
  };
  if (allowOrigin !== "*") h["Access-Control-Allow-Credentials"] = "true";
  return h;
}

// ── Global request-body ceiling ──────────────────────────────────────────────
// The public submit endpoints read their bodies through readJsonObject (64KB cap,
// see middleware/bodyLimit.ts). Every AUTHENTICATED route used a bare
// request.json() instead, so the only ceiling on them was the transport's —
// Caddy's 55MB and proxyClientMaxBodySize, both sized for VIDEO UPLOADS. That let
// any provider account POST a 55MB JSON body to e.g. /api/provider/change-requests
// and have it buffered, parsed and persisted into a jsonb column, repeatedly,
// against a single PM2 fork with a 1GB restart threshold.
//
// Checking it here catches every /api/* route at once, including ones added
// later. It is the OUTER layer, not the authoritative one: Content-Length is
// absent on chunked requests and can understate the real body, so routes that
// handle untrusted input should still read through readJsonObject, which measures
// the actual bytes.
const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1MB — far above any JSON this API takes

// The only routes that legitimately carry a large body: multipart uploads, capped
// separately and by content (5MB images / 50MB gallery video — upload.service.ts).
const LARGE_BODY_PATHS = new Set(["/api/admin/upload", "/api/provider/upload"]);

// ── Version-prefix normalization ─────────────────────────────────────────────
// The mobile apps call /api/v1/*, which next.config.ts rewrites to /api/*. That
// rewrite is step 6 of Next's routing order; this proxy is step 3 — so every
// path seen in here still carries the "/v1" segment the route handler will never
// see.
//
// Two checks below match the path against a fixed set, and BOTH fail open in the
// wrong direction if the prefix isn't stripped:
//
//   • LARGE_BODY_PATHS — "/api/v1/provider/upload" wouldn't match, so the 1MB
//     JSON ceiling would apply to a 50MB gallery video and reject it as 413.
//   • probePaths       — "/api/v1/health" wouldn't match, so an uptime monitor
//     on the versioned path would get 401 once API_KEY is set.
//
// Normalizing once here is what keeps those two sets from having to grow a
// parallel entry per version, forever.
const VERSION_PREFIX = /^\/api\/v\d+(?=\/|$)/;

/**
 * Strip an API version segment: "/api/v1/provider/upload" → "/api/provider/upload".
 * Any path without one is returned unchanged. Exported for unit testing.
 */
export function canonicalApiPath(pathname: string): string {
  return pathname.replace(VERSION_PREFIX, "/api");
}

// Constant-time equality for the shared API key. proxy runs on the Edge runtime,
// which has no node:crypto.timingSafeEqual — so we compare SHA-256 digests via Web
// Crypto instead. Digests are fixed-length and unpredictable, so the byte-wise
// compare leaks neither the length nor the content of the key through timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}

// Returns the value to send back in Access-Control-Allow-Origin, or null to deny.
// With an allowlist configured, only those origins are allowed. With no allowlist:
// reflect any origin in development for convenience, but DENY in production so a
// missing CORS_ALLOWED_ORIGINS can't silently expose the API to every site.
// Exported for unit testing (the deny-by-default-in-production invariant).
export function resolveAllowedOrigin(origin: string): string | null {
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(origin) ? origin : null;
  }
  if (process.env.NODE_ENV === "production") return null;
  return origin || "*";
}

export async function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = resolveAllowedOrigin(origin);
  // Version-stripped path — what the route handler will actually be resolved
  // against. Every path comparison below must use this, never nextUrl.pathname.
  const path = canonicalApiPath(request.nextUrl.pathname);

  // Preflight
  if (request.method === "OPTIONS") {
    const headers: Record<string, string> = { ...corsHeaders };
    if (allowOrigin) Object.assign(headers, originHeaders(allowOrigin));
    return new NextResponse(null, { status: 204, headers });
  }

  // Shed an oversized body before it reaches a route handler (see the constants
  // above). Declared length only — a body that lies about its size is caught by
  // readJsonObject's authoritative byte check further in.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_JSON_BODY_BYTES &&
    !LARGE_BODY_PATHS.has(path)
  ) {
    const headers: Record<string, string> = { ...corsHeaders };
    if (allowOrigin) Object.assign(headers, originHeaders(allowOrigin));
    return NextResponse.json(
      { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
      { status: 413, headers },
    );
  }

  // Optional public gate: when API_KEY is set, every /api request (except the
  // health/readiness probes, which monitors hit without the key) must present a
  // matching X-Api-Key header.
  const apiKey = process.env.API_KEY;
  // Probes + the public sitemap are hit by external tools (monitors, crawlers)
  // that don't send the API key, so they're exempt from the gate.
  // /api/app-version joins the probes: it is how a build that can no longer
  // talk to us finds that out. Gating it behind the API key would mean an app
  // shipped before the key existed gets a bare 401 with no way to learn there
  // is an update — the exact dead end the endpoint exists to prevent.
  const probePaths = new Set([
    "/api/health",
    "/api/ready",
    "/api/sitemap",
    "/api/app-version",
  ]);
  if (
    apiKey &&
    !probePaths.has(path) &&
    !(await timingSafeEqual(request.headers.get("x-api-key") ?? "", apiKey))
  ) {
    const headers: Record<string, string> = { ...corsHeaders };
    if (allowOrigin) Object.assign(headers, originHeaders(allowOrigin));
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Invalid or missing API key" },
      { status: 401, headers },
    );
  }

  // Simple/actual requests
  const response = NextResponse.next();
  if (allowOrigin) {
    for (const [key, value] of Object.entries(originHeaders(allowOrigin))) {
      response.headers.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
