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
};

export default nextConfig;
