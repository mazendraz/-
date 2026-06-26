// CORS for the API. In Next.js 16 the `middleware` convention is renamed to `proxy`.
// Allows the site origin plus the Authorization and X-Api-Key headers the frontend
// client sends (see app/src/lib/api.ts).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

// Returns the value to send back in Access-Control-Allow-Origin, or null to deny.
// With an allowlist configured, only those origins are allowed. With no allowlist:
// reflect any origin in development for convenience, but DENY in production so a
// missing CORS_ALLOWED_ORIGINS can't silently expose the API to every site.
function resolveAllowedOrigin(origin: string): string | null {
  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(origin) ? origin : null;
  }
  if (process.env.NODE_ENV === "production") return null;
  return origin || "*";
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = resolveAllowedOrigin(origin);

  // Preflight
  if (request.method === "OPTIONS") {
    const headers: Record<string, string> = { ...corsHeaders };
    if (allowOrigin) {
      headers["Access-Control-Allow-Origin"] = allowOrigin;
      headers["Vary"] = "Origin";
    }
    return new NextResponse(null, { status: 204, headers });
  }

  // Optional public gate: when API_KEY is set, every /api request (except the
  // health/readiness probes, which monitors hit without the key) must present a
  // matching X-Api-Key header.
  const apiKey = process.env.API_KEY;
  // Probes + the public sitemap are hit by external tools (monitors, crawlers)
  // that don't send the API key, so they're exempt from the gate.
  const probePaths = new Set(["/api/health", "/api/ready", "/api/sitemap"]);
  if (
    apiKey &&
    !probePaths.has(request.nextUrl.pathname) &&
    request.headers.get("x-api-key") !== apiKey
  ) {
    const headers: Record<string, string> = { ...corsHeaders };
    if (allowOrigin) {
      headers["Access-Control-Allow-Origin"] = allowOrigin;
      headers["Vary"] = "Origin";
    }
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Invalid or missing API key" },
      { status: 401, headers },
    );
  }

  // Simple/actual requests
  const response = NextResponse.next();
  if (allowOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowOrigin);
    response.headers.set("Vary", "Origin");
  }
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
