#!/usr/bin/env bash
# Al Assema — roll the running app back to the commit that was live before the last
# deploy (recorded by deploy.sh in deploy/.rollback-sha). Run from the repo root:
#   bash deploy/rollback.sh
#
# ⚠️ This reverts CODE only. Database migrations are FORWARD-ONLY — if the bad
# deploy ran a destructive migration, a code rollback will NOT restore lost data;
# restore from backup instead (see deploy/RESTORE.md). That's why backups run
# nightly regardless.
#
# Typical flow: rollback here to stop the bleeding → fix/revert main on GitHub →
# `bash deploy/deploy.sh` again to move forward cleanly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SHA_FILE="deploy/.rollback-sha"
if [[ ! -f "$SHA_FILE" ]]; then
  echo "✗ $SHA_FILE not found — no recorded rollback point. Deploy at least once first." >&2
  exit 1
fi
SHA="$(cat "$SHA_FILE")"

echo "→ Rolling back working tree to $SHA…"
git reset --hard "$SHA"          # untracked files (api/.env, node_modules, dist) are preserved

# Skip migrations: they're already applied and forward-only.
SKIP_MIGRATE=1 bash "$ROOT/deploy/_build.sh"

echo "✓ Rolled back to $SHA."
echo "  Now fix main on the remote, then run: bash deploy/deploy.sh"
