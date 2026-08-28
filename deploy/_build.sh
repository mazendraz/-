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

# ── Deep-link association files must not ship with placeholders ──────────────
# app/public/.well-known/{apple-app-site-association,assetlinks.json} are what
# make an emailed /verify-email or /reset-password link open in the APP instead
# of the browser. Both shipped with literal placeholders (TEAMID,
# REPLACE_WITH_RELEASE_SHA256), and the failure is silent in the worst way: the
# files serve with HTTP 200 and valid JSON, Apple and Google simply decline to
# verify, and every deep link quietly falls back to Safari/Chrome. Nothing in a
# build log or a smoke test says so.
#
# Fail the deploy instead. Fill in the real Apple Team ID and the release
# signing SHA-256 (`eas credentials`), or delete the entry for an app that is
# not shipping yet.
echo "→ Checking deep-link association files…"
WELL_KNOWN="$ROOT/app/public/.well-known"
# The two association files only — the README next to them documents these
# placeholders on purpose and must not trip the check.
ASSOC_FILES=("$WELL_KNOWN/apple-app-site-association" "$WELL_KNOWN/assetlinks.json")
if grep -qE "TEAMID|REPLACE_WITH_RELEASE_SHA256" "${ASSOC_FILES[@]}" 2>/dev/null; then
  echo "✗ Placeholder value still present in a deep-link association file:" >&2
  grep -nE "TEAMID|REPLACE_WITH_RELEASE_SHA256" "${ASSOC_FILES[@]}" >&2
  echo "  Universal Links / App Links CANNOT verify while these are unset." >&2
  echo "  Fill in the real values, or remove the app entry that is not shipping." >&2
  exit 1
fi
echo "  ok — no placeholders"

echo "→ Building frontend (app/) with VITE_API_URL=$VITE_API_URL…"
cd "$ROOT/app"
npm ci
npm run build

echo "→ Publishing frontend to $WEB_ROOT…"
mkdir -p "$WEB_ROOT"

# ── Why this does NOT `rm -rf` the web root first ─────────────────────────────
# It used to, and that is what produced the "Something went wrong" crash screen
# after every release.
#
# Every route below RootLayout is a `lazy()` import (see app/src/router.tsx), so
# a tab that is ALREADY OPEN when you deploy still holds the previous
# index.html, and the next click asks for a content-hashed chunk from that
# build — /assets/Services-<oldhash>.js. Wiping the directory deletes exactly
# those files, so the import rejects, React throws during render, and the
# top-level ErrorBoundary paints CrashScreen. It resolves on reload, which is
# why it reads as "randomly breaks, works after refresh" rather than as a
# deploy bug.
#
# Content hashes make an overwrite copy safe: a changed file gets a NEW name, so
# nothing is ever replaced in place except the entries that are meant to be
# (index.html, and the unhashed files in public/). Old chunks simply accumulate,
# which is the point — they are what the open tabs are still asking for.
#
# They are then pruned on AGE, not on "not in this build". 14 days is far longer
# than any tab stays open and long enough to cover a rollback to a recent
# release; `-mtime` is refreshed by cp on every deploy for files that are still
# current, so a chunk that survives across builds never ages out.
#
# Scoped to assets/ deliberately: pruning the whole root by age would delete
# index.html and the files served from app/public (favicon, manifest, sw.js,
# locale-init.js, /img/*, /.well-known/*) the moment a build did not touch them.
cp -r dist/* "$WEB_ROOT/"

if [[ -d "$WEB_ROOT/assets" ]]; then
  PRUNED="$(find "$WEB_ROOT/assets" -type f -mtime +14 -print -delete | wc -l)"
  echo "  pruned $PRUNED asset(s) older than 14 days (kept the rest for open tabs)"
fi
