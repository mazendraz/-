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
      // Headroom for concurrent sharp image decodes (admin uploads can each decode
      // up to ~50MP) on top of the Next.js baseline. 512M could trip a restart
      // mid-upload; 1G is safe on a 4GB VPS. Lower only on a memory-constrained box.
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
