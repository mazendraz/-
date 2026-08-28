import path from "path";
import type { NextConfig } from "next";

// Baseline security headers for every API response. The API is JSON-only and
// auth uses a Bearer header (not cookies), so CSP/CORS are handled in proxy.ts;
// these cover transport + framing + sniffing. HSTS assumes the API is served
// over HTTPS in production (Vercel / a TLS-terminating reverse proxy).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Without this, Next.js's root-detection walks UP from here, finds the
  // monorepo's own root package-lock.json (this is an npm workspace), and
  // picks THAT as Turbopack's project root instead of api/ itself — which
  // makes Turbopack resolve/watch/compile against the entire monorepo
  // (mobile/, app/, docs/, design mockups, everything) rather than just this
  // package. Confirmed as the actual cause of this dev server repeatedly
  // taking 60s+ per route on first compile and eventually OOMing outright
  // (heap hit 8GB compiling a single dynamic route) — not a fluke, not
  // leftover processes, this exact misdetection, every time.
  turbopack: { root: __dirname },
  // sharp is a native module — keep it external so the bundler doesn't try to
  // inline its prebuilt binaries.
  serverExternalPackages: ["sharp"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // ── API versioning for the mobile apps ─────────────────────────────────────
  // A published app can never be force-updated the way the website can: whatever
  // contract a build compiled against has to keep answering for as long as that
  // build is installed on someone's phone. So the apps call /api/v1/* and the
  // website keeps calling /api/* — both reach the same 124 handlers today.
  //
  // An alias, deliberately, rather than moving the route files into an app/api/v1
  // directory. Moving them would rewrite every import path and every test for
  // zero behavioural gain, and would have to happen again for v2. When a route
  // genuinely needs a breaking change, THAT route forks into a real
  // app/api/v1/<route> file, which — being a real file — wins over this rewrite.
  //
  // `afterFiles` (not `beforeFiles`): it runs after real files are checked, so a
  // forked v1 handler always takes precedence over the alias. Nothing is shadowed.
  //
  // NOTE: src/proxy.ts runs BEFORE this rewrite (step 3 vs step 6 of Next's
  // routing order) and therefore sees the un-rewritten "/api/v1/..." path. See
  // canonicalApiPath() there — two path allowlists depend on it.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [{ source: "/api/v1/:path*", destination: "/api/:path*" }],
      fallback: [],
    };
  },
  experimental: {
    // src/proxy.ts runs on every /api/* request (matcher: "/api/:path*"), so
    // Next buffers the request body to let both proxy and the route handler
    // read it — capped at 10MB by default. A gallery video upload can be up
    // to 50MB (see upload.service.ts's MAX_VIDEO_UPLOAD_BYTES); past the
    // default cap the body silently truncates mid-multipart-stream, which
    // request.formData() then fails to parse (a generic 500, not a clean
    // validation error). Keep this above MAX_VIDEO_UPLOAD_BYTES, in step with
    // deploy/Caddyfile's request_body max_size.
    proxyClientMaxBodySize: "55mb",
  },
};

export default nextConfig;
