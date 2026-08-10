# SECURITY AUDIT SUMMARY — Al Assema (العاصمة)

**Date:** 2026-08-10 · **Full report:** [`SECURITY-AUDIT-REPORT.md`](SECURITY-AUDIT-REPORT.md)

---

## 1. Overall Risk

# CRITICAL

Driven by a single confirmed finding: **live production secrets are committed to the git repository and have not been rotated.** The application code itself is well above average — across 101 route handlers there is no missing authentication, no missing role gate, and no IDOR. The risk is in the repository, not the code.

---

## 2. Critical Findings (1)

**C-01 — Live production secrets committed to git, unrotated.**
`_backups/al-assema-backup-20260720-191534.tar.gz` is tracked by git and contains `./api/.env`. Seven secrets inside it were verified by SHA-256 fingerprint to be **byte-identical** to the values in use today: `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, Supabase anon key, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`, and the production `DATABASE_URL` including its password.

Anyone with repository read access can forge an `ADMIN` session token for any user (no password), connect directly to the production database, overwrite every uploaded file, take over the Telegram bot, and forge push notifications.

---

## 3. High Findings (3)

**H-01 — Abandoned Supabase project still holds production PII.** Project `vdwurkqarfnrquwihweo` is still `ACTIVE_HEALTHY` with 9 user accounts (bcrypt hashes), 63 audit records and 440 storage objects, but its last migration was applied 2026-07-20 and the repo is 16 migrations ahead. Its service-role key is one of the leaked keys.

**H-02 — The publishing process creates secret leaks.** `scripts/ship.sh` runs `git add -A`, and `_backups/` and `backups/` are in no `.gitignore`. `deploy/backup.sh` writes nightly `pg_dump` output to `/var/www/alassema/backups` — inside the git working tree on the server. Without this fix, C-01 recurs with full database dumps.

**H-03 — No enforced security headers on the frontend origin.** Caddy's static-file block sets only a report-only CSP: no HSTS, no `nosniff`, no `X-Frame-Options`, no `Referrer-Policy`. `next.config.ts` sets all five, but Next only serves `/api/*`. The missing `Referrer-Policy` matters most — the lead tracking page carries `?ref=` and `?token=` in its URL.

---

## 4. Medium Findings (8)

| ID | Finding |
|---|---|
| M-01 | CSP has always shipped as `Report-Only` — it blocks nothing |
| M-02 | Authenticated blind SSRF: `POST /api/push/subscribe` accepts any URL as the push endpoint; the server later POSTs to it |
| M-03 | Change-request `changes` values are typed `z.unknown()` — bypassing the sanitization, `imageRef` and length caps the parallel admin path enforces |
| M-04 | ~50 authenticated routes read bodies with bare `request.json()` — no size cap; the effective ceiling is Caddy's 55 MB video limit |
| M-05 | No rate limiting anywhere behind authentication, including 50 MB video uploads |
| M-06 | Authentication events are not logged — no record of any login, success or failure |
| M-07 | Weak password policy (min 8, no complexity/breach check); no self-service password change, so admins necessarily know every provider's password |
| M-08 | CAPTCHA and Upstash Redis are configured in code but unset in the environment — limits reset on every deploy, and a honeypot is the only bot control |

---

## 5. Low Findings (10) + Informational (4)

**Low:** `Math.random()` for lead reference numbers (L-01) · legacy phone-tail credential fallback (L-02) · `imageRef` accepts any external URL and any `data:image/*` (L-03) · login still returns the JWT in the body although the client no longer reads it (L-04) · push subscriptions re-pointable by endpoint (L-05) · CAPTCHA fails open by default (L-06, accepted) · leftover nested `app/.git` repository (L-07) · no storage lifecycle, uploads are never deleted (L-08) · `rls_auto_enable()` EXECUTE granted to `anon` (L-09) · `esbuild@0.21.5` dev-server advisory via Vite 5 (L-10).

**Informational:** `api/SECURITY.md` is materially out of date · `app/vercel.json` CSP contains a literal `REPLACE-WITH-API-DOMAIN` placeholder · internal UUIDs in public payloads (accepted) · Supabase leaked-password protection disabled (not applicable — the app does not use Supabase Auth).

---

## 6. Most Important Fixes

### Do today
1. **Rotate every secret** — `JWT_SECRET`, Supabase database password, service-role key, anon key, Telegram bot token, Telegram webhook secret, VAPID keypair. Then update the server's `api/.env` and restart PM2.
2. **Force a password reset on all 9 accounts** — assume the database was readable.
3. **Purge the archive from git history** and add `_backups/` to `.gitignore`. Rotate *before* purging — the archive already exists in every clone and fork.
4. **Review Supabase logs and `AuditLog`** for unexplained activity since 2026-07-20.

### This week
5. Gitignore `_backups/`, `backups/`, `*.tar.gz`, `*.dump`, `*.sql`; move `LOCAL_BACKUP_DIR` outside the repo; add a pre-commit secret scan to `ship.sh`.
6. Decommission or wipe the abandoned Supabase project — after deciding whether it is still your Storage backend.
7. Add the full security-header block to `deploy/Caddyfile`, then enforce the CSP (drop `-Report-Only`).

### This month
8. Allowlist push endpoint hosts (M-02) · validate change-request values (M-03) · apply `readJsonObject` to authenticated routes (M-04) · add per-user rate limits (M-05) · log authentication events (M-06) · strengthen the password policy and add self-service change (M-07) · enable Turnstile and Upstash Redis (M-08).

---

## 7. Security Score

# 41 / 100

| Domain | Score |
|---|---|
| Authorization | 92 |
| Input validation & injection | 88 |
| Supply chain | 80 |
| Authentication | 78 |
| API security | 74 |
| Frontend / client-side | 72 |
| Database & RLS | 70 |
| Logging & monitoring | 55 |
| Infrastructure & headers | 55 |
| **Secrets management** | **5** |

**Method:** 100 minus weighted deductions (Critical −40, High −7 each, Medium −2.5 each, Low/Info −0.5 each), plus +29 credit for verified application-layer controls — authentication and authorization architecture, injection resistance, XSS posture, input validation, public-endpoint abuse controls, and data-exposure discipline.

Read the shape, not just the number: **one domain is dragging everything else down.** Fix the secrets and the score moves to roughly 81.

---

## 8. Coverage

**~92% fully verified** — 30 categories PASS · 5 PARTIAL · 1 MANUAL · 0 FAIL, across all 36 audit categories.

Reviewed: 101 API route handlers, 21 Prisma models, 33 migrations, all authentication/middleware/guard/service/validation modules, the full React SPA source, the built `dist/` bundle, Caddy and PM2 deployment configuration, the GitHub Actions workflow, both lockfiles, the git index, and the live Supabase project (read-only introspection).

---

## 9. Areas That Could Not Be Verified

1. **Live HTTP response headers and TLS** — no network access to the production host. `deploy/Caddyfile` was reviewed as source. Confirm with `curl -I https://<your-domain>/`.
2. **Full git commit history** — `git` is not on this shell's PATH. The tarball was confirmed tracked by parsing `.git/index` directly, but historical commits could not be enumerated for other secrets. Run `gitleaks detect --source . --log-opts="--all"`.
3. **`npm audit` against the live advisory database** — `npm` is not on this shell's PATH. Dependency analysis was done statically from both lockfiles; no vulnerable package was identified beyond L-10.
4. **Server runtime configuration** — the deployed `api/.env`, the installed `/etc/caddy/Caddyfile`, firewall rules, SSH hardening and fail2ban are outside the repository. Confirm `RATE_LIMIT_ALLOW_INMEMORY`, `CORS_ALLOWED_ORIGINS` and `VITE_API_URL` on the server.
5. **DNS, SPF, DKIM, DMARC** — deliberately not tested; the audit rules prohibit contacting third-party systems. Since email is sent via Resend, confirm SPF and DKIM are published for the sending domain.
6. **Whether the abandoned Supabase project is still the live Storage backend** — evidence points both ways (440 objects and a CSP allowing `*.supabase.co` suggest yes; a 16-migration gap suggests the database moved). This determines whether H-01 is "decommission it" or "it is production and was being treated as abandoned". Only you can answer it.
7. **Repository visibility (public vs private)** — this scales C-01's blast radius. If the repository is or ever was public, treat every secret as fully compromised and check GitHub's secret-scanning alerts.

---

*No application code, configuration, environment variable, database record or production resource was modified. No destructive, denial-of-service, brute-force or third-party exploitation was performed. No secret value appears in either document.*
