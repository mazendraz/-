#!/usr/bin/env bash
# Al Assema — nightly backup of the Postgres database into TWO locations. Run from
# cron on the VPS:
#
#   0 3 * * *  /var/www/alassema/deploy/backup.sh >> /var/log/alassema-backup.log 2>&1
#
# It is intentionally boring and safe: it only READS from the database (pg_dump).
# Two copies, so your data is never in one place only:
#   1) LOCAL — kept on the VPS disk ($LOCAL_BACKUP_DIR). Hostinger's own auto-backup
#      then captures it as part of the server snapshot. (always on)
#   2) OFF-SITE — optionally uploaded via rclone to BACKUP_REMOTE (e.g. an rclone
#      S3 remote pointed at Supabase Storage — the account you already have). If
#      rclone/BACKUP_REMOTE isn't configured, the script just keeps copy #1.
#
# One-time setup:
#   sudo apt-get install -y postgresql-client
#   # For the off-site copy (optional but recommended): install rclone and add a
#   # remote pointed at Supabase Storage (Settings → Storage → S3 access keys):
#   sudo apt-get install -y rclone && rclone config     # name it e.g. "supa-s3"
#   #   then set BACKUP_REMOTE below to "supa-s3:alassema-backups"
#
# See deploy/RESTORE.md for how to restore — and rehearse it at least once.
set -euo pipefail

# ── Config (override via environment, or edit these defaults) ──────────────────
# Path to the app env file that holds DATABASE_URL (never hard-code credentials).
ENV_FILE="${BACKUP_ENV_FILE:-/var/www/alassema/api/.env}"
# Off-site rclone destination "remote:bucket" (the remote must exist in `rclone
# config`). For the simple two-provider setup, point this at Supabase Storage,
# e.g. "supa-s3:alassema-backups". Leave EMPTY to keep the local copy only.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
# Optional: an rclone S3 remote pointed at Supabase Storage (Settings → Storage →
# S3 access keys). Leave empty to skip mirroring image buckets.
STORAGE_REMOTE="${STORAGE_REMOTE:-}"
# How many days of database dumps to keep off-site.
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
# Optional dead-man's-switch URL (healthchecks.io / BetterStack heartbeat). Pinged
# only on success; a missed ping triggers the alert. Leave empty to disable.
HEALTHCHECK_URL="${BACKUP_HEALTHCHECK_URL:-}"
# Where to KEEP dumps ON the VPS (retained + pruned). This is your SECOND copy:
# it lives on the server's disk so Hostinger's own auto-backup captures it too.
#
# ── MUST live OUTSIDE the repo working tree ──────────────────────────────────
# This used to default to /var/www/alassema/backups — which is INSIDE the git
# checkout (deploy.sh's ROOT is /var/www/alassema). Nightly pg_dump output was
# therefore sitting in a git repo, one `git add -A` away from being pushed. That
# is exactly how api/.env reached GitHub on 2026-07-20, except a dump is the
# whole customer database rather than the keys to it.
#
# /var/backups is the FHS location for this and is still captured by Hostinger's
# disk snapshot. If you override it, keep it outside /var/www/alassema.
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/alassema}"

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
mkdir -p "$LOCAL_BACKUP_DIR"
DUMP="$LOCAL_BACKUP_DIR/alassema-db-$STAMP.dump"

# ── Dump (custom format = already compressed + supports selective restore) ────
echo "→ [$STAMP] dumping database…"
pg_dump "$DATABASE_URL" \
  --no-owner --no-privileges \
  --format=custom \
  --file="$DUMP"
echo "  dump size: $(du -h "$DUMP" | cut -f1)"

# ── Upload off-site (SECOND location — e.g. an rclone remote pointed at Supabase
#    Storage). Optional: if BACKUP_REMOTE/rclone isn't set up, we still have the
#    retained local copy above (which Hostinger's disk backup captures). ─────────
if [[ -n "$BACKUP_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
  echo "→ uploading off-site to $BACKUP_REMOTE/db/…"
  rclone copy "$DUMP" "$BACKUP_REMOTE/db/" --no-traverse

  # Optional: mirror Supabase Storage image buckets too.
  if [[ -n "$STORAGE_REMOTE" ]]; then
    for bucket in logos covers gallery projects; do
      echo "→ syncing storage bucket '$bucket'…"
      rclone sync "$STORAGE_REMOTE:$bucket" "$BACKUP_REMOTE/storage/$bucket/"
    done
  fi

  echo "→ pruning off-site dumps older than ${RETENTION_DAYS}d…"
  rclone delete "$BACKUP_REMOTE/db/" --min-age "${RETENTION_DAYS}d"
else
  echo "  (no off-site remote configured — keeping the local copy only)"
fi

# ── Prune old LOCAL dumps ─────────────────────────────────────────────────────
echo "→ pruning local dumps older than ${RETENTION_DAYS}d in $LOCAL_BACKUP_DIR…"
find "$LOCAL_BACKUP_DIR" -name 'alassema-db-*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete

# ── Success heartbeat (dead-man's switch) ─────────────────────────────────────
if [[ -n "$HEALTHCHECK_URL" ]]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null || \
    echo "  (warning: heartbeat ping failed — backup itself succeeded)"
fi

echo "✓ [$STAMP] backup complete → local: $DUMP${BACKUP_REMOTE:+ · off-site: $BACKUP_REMOTE/db/$(basename "$DUMP")}"
