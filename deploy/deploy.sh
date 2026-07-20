#!/usr/bin/env bash
# Al Assema — VPS deploy script. Run from the repo root on the server:
#   bash deploy/deploy.sh            # pulls the branch currently checked out here
#   bash deploy/deploy.sh main       # or force a specific branch
#
# Pulls the latest code for that branch, rebuilds both apps, applies DB migrations,
# and restarts the API via PM2. Safe to re-run. Assumes one-time setup is done
# (see deploy/README.md).
#
# Before pulling it records the currently-deployed commit to deploy/.rollback-sha,
# so if this release misbehaves you can `bash deploy/rollback.sh` back to it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Save the currently-running commit as the rollback point BEFORE we move HEAD, so
# it always points at the last version that was actually live.
git rev-parse HEAD > deploy/.rollback-sha
echo "-> Rollback point saved: $(cat deploy/.rollback-sha)"

# Pull the branch given as $1, or whatever branch is checked out here on the server.
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "-> Pulling latest code for branch: $BRANCH ..."
git pull origin "$BRANCH"

bash "$ROOT/deploy/_build.sh"

echo "OK Deploy complete. Frontend live behind Caddy; API on :3000 via PM2."
echo "   If this release is bad:  bash deploy/rollback.sh"
echo "   If you changed /etc/caddy/Caddyfile, run: sudo systemctl reload caddy"
