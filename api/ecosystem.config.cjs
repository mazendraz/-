// PM2 process config for the Al Assema backend (Next.js) on a VPS.
//   Run from the api/ folder:  pm2 start ecosystem.config.cjs
//
// Single instance (fork mode) on purpose: the in-memory rate limiter
// (src/lib/middleware/rateLimit.ts) only works per-process, so one instance
// keeps it correct. Move to Upstash Redis before scaling to cluster mode.
//
// Runtime env (DATABASE_URL, JWT_SECRET, Supabase keys, …) is read by Next.js
// from api/.env on the server — create that file from .env.example first.
module.exports = {
  apps: [
    {
      name: "alassema-api",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
