#!/usr/bin/env bash
# Shared build+publish+restart steps for Al Assema. Called by BOTH deploy.sh (after
# a git pull) and rollback.sh (after a git reset). Not meant to be run directly.
#
# Env:
#   WEB_ROOT      where Caddy serves the frontend from (must match deploy/Caddyfile)
#   VITE_API_URL  same-origin API path baked into the frontend build
#   SKIP_MIGRATE  set to 1 to skip `prisma migrate deploy` (rollback uses this,
#                 since migrations are forward-only and already applied)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/alassema/dist}"
export VITE_API_URL="${VITE_API_URL:-/api}"

echo "→ Building backend (api/)…"
cd "$ROOT/api"
npm ci
npx prisma generate
if [[ "${SKIP_MIGRATE:-0}" == "1" ]]; then
  echo "  (skipping migrations — rollback; DB is forward-only)"
else
  npx prisma migrate deploy          # apply any new migrations (non-destructive)
fi
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
