# Monitoring & Alerting — Al Assema

Goal: **you find out about problems before your customers do.** With a single VPS
instance and no alerting, the first monitor is an angry provider whose leads stopped
arriving. Everything below is free-tier and takes one afternoon.

Four layers, in priority order:

1. [Uptime + DB health](#1-uptime--database-health) — the one that matters most.
2. [Error reporting (Sentry)](#2-error-reporting-sentry) — already wired in code.
3. [Backup heartbeat](#3-backup-heartbeat) — know when a backup silently stops.
4. [Server health (logs, disk, memory)](#4-server-health).

---

## 1. Uptime + database health

The app already exposes the right probe: **`GET /api/ready`** returns `200
{"ok":true,"db":"up"}` when healthy and **`503`** when the database is unreachable
([api/src/app/api/ready/route.ts](../api/src/app/api/ready/route.ts)). It is exempt
from the API-key gate, so a monitor can hit it with no auth.

Set up an external monitor (pick one — both have free tiers):

- **BetterStack (Better Uptime)** or **UptimeRobot**
  - Monitor type: HTTP(S)
  - URL: `https://your-domain.com/api/ready`
  - Interval: 1–3 min
  - Expect: HTTP `200` **and** body contains `"db":"up"` (BetterStack supports a
    keyword assertion — use it, so a `503` with `"db":"down"` fails even if the box
    answers).
  - Alert to: **email + phone push** (install the app) + optionally SMS. This is the
    page that wakes you up.

Add a second monitor on `https://your-domain.com/` (the SPA) so you also catch
"Caddy up, static site broken" independently of the API.

**Why `/api/ready` and not `/api/health`:** `/health` is liveness only (always 200);
`/ready` actually runs `SELECT 1`, so it catches the most common real outage — the
app is up but Supabase is unreachable/paused/connection-exhausted.

---

## 2. Error reporting (Sentry)

The error reporter is already implemented ([api/src/lib/observability/report.ts](../api/src/lib/observability/report.ts))
— every unhandled 500 in `withErrors` is shipped to Sentry over its HTTP envelope
API. It is dormant until you set the DSN.

1. Create a free Sentry project (platform: Node).
2. Add to `api/.env` on the server:
   ```
   SENTRY_DSN="https://<key>@<org>.ingest.sentry.io/<project>"
   ```
3. `pm2 reload alassema-api`.
4. Confirm: trigger one test error (e.g. hit a route with a malformed body that
   reaches a 500 path) and check it appears in Sentry within a minute.
5. In Sentry, add an **alert rule**: "notify when an issue is seen > 5 times in 10
   minutes" → email/Slack. Without a rule, Sentry collects but never pages you.

---

## 3. Backup heartbeat

[`deploy/backup.sh`](backup.sh) pings a URL **only on success**. Use a dead-man's
switch so a *missing* ping alerts you (a cron that silently stopped is invisible
otherwise):

1. Create a check at **healthchecks.io** (free) or BetterStack "Heartbeat".
2. Set its period to 1 day + a grace window (e.g. 6 h).
3. Put its ping URL in the backup cron:
   ```
   0 3 * * *  BACKUP_HEALTHCHECK_URL="https://hc-ping.com/<uuid>" /var/www/alassema/deploy/backup.sh >> /var/log/alassema-backup.log 2>&1
   ```
4. If backup.sh fails (it runs with `set -e`), it exits before the ping → the check
   goes red → you get alerted. Verify once by running it with a deliberately wrong
   `BACKUP_REMOTE` and confirming the alert fires.

---

## 4. Server health

### Log rotation (stop PM2 logs filling the disk)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

### Disk space alert

A full disk silently breaks uploads, logs, and backups. Simplest reliable option is
a healthchecks.io check pinged only while disk is healthy — but a cron + webhook is
fine too. Minimal version (alerts when root fs > 85%):

```bash
# /var/www/alassema/deploy/disk-check.sh  (chmod +x)
#!/usr/bin/env bash
set -euo pipefail
USED=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
if (( USED > 85 )); then
  # Replace with your alert webhook (Slack, Discord, BetterStack incoming webhook)
  curl -fsS -m 10 -X POST "$DISK_ALERT_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"⚠️ Al Assema VPS disk at ${USED}%\"}" || true
fi
```
```
# cron: hourly
0 * * * *  DISK_ALERT_WEBHOOK="https://hooks.slack.com/…" /var/www/alassema/deploy/disk-check.sh
```

Or, if your uptime provider offers a lightweight server agent (BetterStack does),
install it and let it watch CPU/RAM/disk — that covers this layer without cron.

---

## What "monitored" means before you launch (checklist)

- [ ] `/api/ready` uptime monitor with `"db":"up"` keyword assertion → alerts to phone.
- [ ] Second monitor on `/` (the SPA).
- [ ] `SENTRY_DSN` set, a test error received, and an alert rule created.
- [ ] Backup heartbeat check created, wired into the cron, and its alert verified once.
- [ ] `pm2-logrotate` installed and configured.
- [ ] Disk alert (cron or agent) in place.
- [ ] You have **tested** at least one alert path (paused Supabase for 60s, or broke
      the backup) and actually received the notification. An untested alert is a
      guess.
