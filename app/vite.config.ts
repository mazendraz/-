import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// app/package.json has "type": "module", so this file is loaded as ESM —
// __dirname isn't a global here; derive it the standard ESM way instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // app/ is not an npm workspace (see deploy/_build.sh), so there is no
      // node_modules/@alassema/core to resolve at build time. This alias
      // points the bare specifier straight at the package's source instead —
      // Vite/Rollup follow it like any other file, no workspace symlink
      // needed. (api/'s Next.js/Turbopack build can't use the same trick:
      // its `turbopack.root` is pinned to api/, so it refuses to resolve
      // anything outside that directory — see api/next.config.ts and
      // api/src/lib/validation/emailTemplateRules.ts for how that side
      // handles it instead.)
      "@alassema/core": path.resolve(__dirname, "../packages/core/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    open: true,
    // Proxy /api → the backend so dev is SAME-ORIGIN (like prod behind Caddy).
    // This lets the httpOnly SameSite=Strict session cookie flow in dev exactly as
    // it will in production. Set VITE_API_URL=/api in app/.env.local to use it.
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
