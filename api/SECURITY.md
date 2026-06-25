# Security Checklist — Al Assema API

Status of the backend-plan §8 hardening items.

| Control | Status | Where |
|---|---|---|
| **Rate limiting** on `POST /leads` (5/min/IP) | ✅ | [rateLimit.ts](src/lib/middleware/rateLimit.ts), [leads route](src/app/api/leads/route.ts) |
| **Rate limiting** on `POST /auth/login` (10/min/IP) | ✅ | [login route](src/app/api/auth/login/route.ts) |
| **Client-IP spoof resistance** — XFF read from the rightmost trusted hop (`TRUSTED_PROXY_HOPS`), not the spoofable leftmost | ✅ | [rateLimit.ts](src/lib/middleware/rateLimit.ts), [Caddyfile](../deploy/Caddyfile) |
| **Bot protection** on lead form (honeypot `website` field) | ✅ | [leads route](src/app/api/leads/route.ts) |
| **Input validation** (Zod) on every write | ✅ | [validation/](src/lib/validation/) |
| **Input sanitization** — strip HTML from free-text (descriptions, reviews, about, tagline) | ✅ | [sanitize.ts](src/lib/utils/sanitize.ts) |
| **Password hashing** (bcrypt, 12 rounds) | ✅ | [auth.ts](src/lib/auth.ts) |
| **JWT** returned in body, signed HS256, TTL via `JWT_TTL` (default 7d) | ✅ | [auth.ts](src/lib/auth.ts) |
| **CORS** allowlist via `CORS_ALLOWED_ORIGINS`; production denies unlisted origins | ✅ | [proxy.ts](src/proxy.ts) |
| Optional **X-Api-Key** public gate | ✅ | [proxy.ts](src/proxy.ts) |
| **No internal error leakage** — unknown errors → generic 500 | ✅ | [withErrors.ts](src/lib/utils/withErrors.ts) |
| **SQL injection** — parameterized via Prisma | ✅ | ORM |
| **Ownership enforcement** — providers see/modify only their company's leads | ✅ | [withRole.ts](src/lib/middleware/withRole.ts), [leads/[id]](src/app/api/leads/[id]/route.ts) |
| **Secrets in env only** (never in code) | ✅ | [.env.example](.env.example) |

## Production deployment notes

- **Set `CORS_ALLOWED_ORIGINS`** to the exact site origin(s). With it unset in
  production the API denies all cross-origin requests (fail-closed).
- **Rotate `JWT_SECRET`** and set a short **`JWT_TTL`** (default is now `1d`; use
  `1h` for high-value deployments); add refresh tokens for longer sessions.
  localStorage tokens are XSS-exposed by design (the client requires a Bearer
  token in the body) — keep the TTL short. There is no token denylist: to revoke
  a session before expiry, set the user's `isActive=false` (rejected on the next
  request by `getAuthUser`).
- **Set `TRUSTED_PROXY_HOPS`** to the number of reverse proxies in front of the
  app (Caddy alone = 1; add a CDN → 2). The rate limiter derives the client IP
  from the rightmost hop, so a forged `X-Forwarded-For` can't rotate past the
  per-IP limits. The provided [Caddyfile](../deploy/Caddyfile) also re-sets the
  header from the real peer as defense-in-depth.
- **Rate limiter** is in-memory by default (correct for single-instance PM2 fork).
  For multi-instance/serverless, set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  to use Upstash Redis; a Redis outage falls back to in-memory (still limiting).
- **Storage**: Supabase buckets `logos/covers/gallery/projects` — public read,
  service-role write only.
- **Error reporting**: unhandled 500s are reported to Sentry when `SENTRY_DSN` is
  set (over the HTTP envelope API; always logged regardless) — see
  [observability/report.ts](src/lib/observability/report.ts).
- **CAPTCHA**: set `TURNSTILE_SECRET_KEY` (or `RECAPTCHA_SECRET_KEY`) to require a
  CAPTCHA on the public lead/site-review/review submits (no-op until set). Enabling
  it requires the frontend to render the matching widget and send the token.

## Known follow-ups

- CAPTCHA backend verification is wired (Turnstile/reCAPTCHA, no-op until a secret
  is set); turning it on still needs the frontend widget + token field.
- Hard JWT invalidation on logout (jti denylist) — currently client-side drop;
  deactivating the user (isActive=false) revokes immediately in the meantime.
