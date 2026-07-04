#!/usr/bin/env bash
# Al Assema — nightly off-site backup of the Postgres database (and, optionally,
# the Supabase Storage buckets). Run from cron on the VPS:
#
#   0 3 * * *  /var/www/alassema/deploy/backup.sh >> /var/log/alassema-backup.log 2>&1
#
# It is intentionally boring and safe: it only READS from the database (pg_dump),
# writes a single dump file to a temp dir, uploads it off-site, prunes old copies,
# and pings a dead-man's-switch URL on success (a MISSING ping is what alerts you).
#
# One-time setup:
#   sudo apt-get install -y postgresql-client rclone
#   rclone config          # create a remote named to match BACKUP_REMOTE below.
#                          # Use a DIFFERENT provider/account than Supabase (e.g.
#                          # Backblaze B2, Wasabi, or any S3) so one compromised
#                          # account can't take out both prod and its backups.
#
# See deploy/RESTORE.md for how to restore — and rehearse it at least once.
set -euo pipefail

# ── Config (override via environment, or edit these defaults) ──────────────────
# Path to the app env file that holds DATABASE_URL (never hard-code credentials).
ENV_FILE="${BACKUP_ENV_FILE:-/var/www/alassema/api/.env}"
# rclone destination "remote:bucket" (the remote name must exist in `rclone config`).
BACKUP_REMOTE="${BACKUP_REMOTE:-b2:alassema-backups}"
# Optional: an rclone S3 remote pointed at Supabase Storage (Settings → Storage →
# S3 access keys). Leave empty to skip mirroring image buckets.
STORAGE_REMOTE="${STORAGE_REMOTE:-}"
# How many days of database dumps to keep off-site.
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
# Optional dead-man's-switch URL (healthchecks.io / BetterStack heartbeat). Pinged
# only on success; a missed ping triggers the alert. Leave empty to disable.
HEALTHCHECK_URL="${BACKUP_HEALTHCHECK_URL:-}"
TMP_DIR="${TMPDIR:-/tmp}"

# ── Load DATABASE_URL from the app env ────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ env file not found: $ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL not set in $ENV_FILE}"

STAMP="$(date +%Y-%m-%dT%H%M%S)"
DUMP="$TMP_DIR/alassema-db-$STAMP.dump"

# Always remove the local dump, even on failure (it contains all your data).
cleanup() { rm -f "$DUMP"; }
trap cleanup EXIT

# ── Dump (custom format = already compressed + supports selective restore) ────
echo "→ [$STAMP] dumping database…"
pg_dump "$DATABASE_URL" \
  --no-owner --no-privileges \
  --format=custom \
  --file="$DUMP"
echo "  dump size: $(du -h "$DUMP" | cut -f1)"

# ── Upload off-site ───────────────────────────────────────────────────────────
echo "→ uploading to $BACKUP_REMOTE/db/…"
rclone copy "$DUMP" "$BACKUP_REMOTE/db/" --no-traverse

# ── Optional: mirror Supabase Storage image buckets ───────────────────────────
if [[ -n "$STORAGE_REMOTE" ]]; then
  for bucket in logos covers gallery projects; do
    echo "→ syncing storage bucket '$bucket'…"
    rclone sync "$STORAGE_REMOTE:$bucket" "$BACKUP_REMOTE/storage/$bucket/"
  done
fi

# ── Prune old dumps ───────────────────────────────────────────────────────────
echo "→ pruning db dumps older than ${RETENTION_DAYS}d…"
rclone delete "$BACKUP_REMOTE/db/" --min-age "${RETENTION_DAYS}d"

# ── Success heartbeat (dead-man's switch) ─────────────────────────────────────
if [[ -n "$HEALTHCHECK_URL" ]]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null || \
    echo "  (warning: heartbeat ping failed — backup itself succeeded)"
fi

echo "✓ [$STAMP] backup complete → $BACKUP_REMOTE/db/$(basename "$DUMP")"
