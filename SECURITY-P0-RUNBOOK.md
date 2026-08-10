# P0 RUNBOOK — Credential Rotation & History Purge

**Owner-executed. Claude cannot do any of this** — it requires the Supabase dashboard, @BotFather, SSH to the server, and a force-push (which `CLAUDE.md` forbids without your explicit go-ahead).

Related: [`SECURITY-AUDIT-REPORT.md`](SECURITY-AUDIT-REPORT.md) finding **C-01**.

---

## Why this order

**Rotate first. Purge second.** Purging history without rotating changes nothing — the archive already exists in every clone, every fork, and any CI cache that ever checked the repo out. Rotation is what actually revokes access; the purge only stops it happening again.

---

## Step 1 — Rotate every secret

Work through this table top to bottom. After each one, update `api/.env` **on the server** (`/var/www/alassema/api/.env`), not just locally.

| # | Secret | Where to rotate | Notes |
|---|---|---|---|
| 1 | `JWT_SECRET` | `openssl rand -base64 48` | Invalidates every live session. Expected — everyone re-logs in |
| 2 | Supabase DB password | Dashboard → Settings → Database → Reset password | Then update **both** `DATABASE_URL` and `DIRECT_URL` |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → API Keys → roll secret key | |
| 4 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → API Keys → roll | Roll alongside #3 |
| 5 | `TELEGRAM_BOT_TOKEN` | @BotFather → `/revoke` | Then re-register the webhook (Step 2) |
| 6 | `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 24` | Used in Step 2 |
| 7 | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | ⚠️ **Breaks every existing push subscription.** Users must re-enable notifications. Plan the comms |

### Verify each rotation took

Fingerprints of the **compromised** values (SHA-256, first 10 hex). After rotating, each must **differ**:

```bash
fp() { printf '%s' "$1" | sha256sum | cut -c1-10 | tr 'a-f' 'A-F'; }

fp "$JWT_SECRET"                 # must NOT be CD2045F013
fp "$SUPABASE_SERVICE_ROLE_KEY"  # must NOT be 11F25BD6D4
fp "$NEXT_PUBLIC_SUPABASE_ANON_KEY"  # must NOT be B853CF38A9
fp "$TELEGRAM_BOT_TOKEN"         # must NOT be 521E39FDAA
fp "$TELEGRAM_WEBHOOK_SECRET"    # must NOT be 19CC5C2DBD
fp "$VAPID_PRIVATE_KEY"          # must NOT be 99796EFADB
fp "$DATABASE_URL"               # must NOT be 5067E2A0F7
```

Then restart: `cd /var/www/alassema/api && pm2 restart alassema-api`

---

## Step 2 — Re-register the Telegram webhook

Required after rotating #5 and #6, or provider self-linking silently stops working.

```bash
curl "https://api.telegram.org/bot<NEW_TOKEN>/setWebhook?url=https://<your-domain>/api/telegram/webhook&secret_token=<NEW_WEBHOOK_SECRET>"
```

Confirm: `curl "https://api.telegram.org/bot<NEW_TOKEN>/getWebhookInfo"`

---

## Step 3 — Force a password reset on all accounts

Assume the database was readable, so assume every bcrypt hash is now offline-crackable.

There are 9 accounts. There is currently no self-service password change (that is fix **M-07**, Phase 4), so an admin must set each one via `PATCH /api/admin/users/:id` — the Team tab in the admin dashboard.

Do this **after** Step 1, so the new passwords are never written to a database reachable with the old credentials.

---

## Step 4 — Purge the archive from git history

⚠️ **This rewrites history and needs a force-push.** `CLAUDE.md` forbids `rebase` and `push --force` because they have broken this repo before. Do it deliberately, once, and tell every collaborator to re-clone afterwards.

Phase 1 (already applied by Claude) has gitignored `_backups/`, so the file will not come back.

```bash
# 0. Back up the repo first — this is destructive.
cp -r . ../al-assema-prepurge-backup

# 1. Stop tracking it (Phase 1 already added _backups/ to .gitignore).
git rm --cached _backups/al-assema-backup-20260720-191534.tar.gz
git commit -m "chore: stop tracking local backup archive"

# 2. Purge from all history. Requires: pip install git-filter-repo
git filter-repo --path _backups/ --invert-paths --force

# 3. Re-add the remote (filter-repo drops it) and force-push.
git remote add origin <your-remote-url>
git push origin --force --all
git push origin --force --tags
```

**Then:** every collaborator deletes their local clone and re-clones. A stale clone still contains the archive and will push it back.

**Also:** if the repo is on GitHub, open a support request to purge cached views of the old objects — force-push alone does not evict them from GitHub's cache immediately.

---

## Step 5 — Assume breach: look for what you cannot explain

```sql
-- Admin actions since the archive was committed
SELECT "createdAt", "actorEmail", action, entity, "entityId"
FROM "AuditLog"
WHERE "createdAt" > '2026-07-20'
ORDER BY "createdAt" DESC;

-- Accounts you do not recognise
SELECT id, email, role, "isActive", "createdAt", "updatedAt" FROM "User" ORDER BY "createdAt";
```

Also check: Supabase Dashboard → Logs (Postgres + Storage) for connections from IPs you do not recognise; and Telegram — has the bot been messaging chats you did not expect?

Note that a forged admin JWT leaves **no login trace** — logins are not currently audited (that is fix **M-06**, Phase 4). Absence of evidence here is not evidence of absence.

---

## Step 6 — Decide on the abandoned Supabase project (H-01)

Project `vdwurkqarfnrquwihweo` is still `ACTIVE_HEALTHY` with 9 user rows, 63 audit rows and 440 storage objects, but its last migration was 2026-07-20 and the repo is 16 migrations ahead.

**Answer this first:** is it still serving your images? Check whether any live `Company.logo` / `cover` / `gallery` URL points at `*.supabase.co`.

* **Yes, still Storage** → it is production. Rotate its keys (done in Step 1), keep it, and schedule the move to `STORAGE_DRIVER=local` (already implemented in `upload.service.ts`) so the VPS backup covers images.
* **No, fully retired** → export anything needed for compliance, then drop the `public` tables or delete the project. Leaving 9 password hashes in an unmonitored system serves no purpose.

---

## Step 7 — Server follow-up for the Phase 1 backup-path change

Claude changed `deploy/backup.sh` so nightly dumps default to `/var/backups/alassema` instead of `/var/www/alassema/backups` (which sat **inside** the git checkout). Existing dumps are still in the old location — move them, or they stay one `git add -A` away from being pushed:

```bash
sudo mkdir -p /var/backups/alassema
sudo mv /var/www/alassema/backups/*.dump /var/backups/alassema/ 2>/dev/null || true
sudo rmdir /var/www/alassema/backups 2>/dev/null || true

# Confirm nothing dump-shaped is left in the repo tree:
find /var/www/alassema -name '*.dump' -o -name '*.sql' -o -name '*.tar.gz' | grep -v node_modules
```

If your cron line sets `LOCAL_BACKUP_DIR` explicitly, update it too. Then run one backup manually to confirm the new path works: `bash /var/www/alassema/deploy/backup.sh`

---

## Completion checklist

- [ ] All 7 secrets rotated; every fingerprint differs from the list in Step 1
- [ ] Server `api/.env` updated and `pm2 restart alassema-api` done
- [ ] Site loads; admin login works with the new `JWT_SECRET`
- [ ] Telegram webhook re-registered; `getWebhookInfo` shows the new URL
- [ ] All 9 account passwords reset
- [ ] `git log --all --full-history -- _backups/` returns nothing
- [ ] All collaborators have re-cloned
- [ ] `AuditLog` and Supabase logs reviewed for unexplained activity
- [ ] Decision recorded on the abandoned Supabase project
