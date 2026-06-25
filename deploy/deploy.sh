#!/usr/bin/env bash
# Al Assema — VPS deploy script. Run from the repo root on the server:
#   bash deploy/deploy.sh
#
# Pulls latest main, rebuilds both apps, applies DB migrations, and restarts the
# API via PM2. Safe to re-run. Assumes one-time setup is done (see deploy/README.md).
set -euo pipefail

# Where Caddy serves the frontend from (must match deploy/Caddyfile `root`).
WEB_ROOT="${WEB_ROOT:-/var/www/alassema/dist}"
# Same-origin API path (frontend is served next to the API behind Caddy).
export VITE_API_URL="${VITE_API_URL:-/api}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Pulling latest code…"
git pull origin main

echo "→ Building backend (api/)…"
cd "$ROOT/api"
npm ci
npx prisma generate
npx prisma migrate deploy          # apply any new migrations (non-destructive)
npm run build

echo "→ (Re)starting API with PM2…"
pm2 reload alassema-api 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save

echo "→ Building frontend (app/) with VITE_API_URL=$VITE_API_URL…"
cd "$ROOT/app"
npm ci
npm run build

echo "→ Publishing frontend to $WEB_ROOT…"
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}/"*
cp -r dist/* "$WEB_ROOT/"

echo "✓ Deploy complete. Frontend live behind Caddy; API on :3000 via PM2."
echo "  If you changed /etc/caddy/Caddyfile, run: sudo systemctl reload caddy"
