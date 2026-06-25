import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module — keep it external so the bundler doesn't try to
  // inline its prebuilt binaries.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
