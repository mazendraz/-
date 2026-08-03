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
  // sharp is a native module — keep it external so the bundler doesn't try to
  // inline its prebuilt binaries.
  serverExternalPackages: ["sharp"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
