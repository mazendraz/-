import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
