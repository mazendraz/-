# Security Checklist — Al Assema API

Status of the backend-plan §8 hardening items.

| Control | Status | Where |
|---|---|---|
| **Rate limiting** on `POST /leads` (5/min/IP) | ✅ | [rateLimit.ts](src/lib/middleware/rateLimit.ts), [leads route](src/app/api/leads/route.ts) |
| **Rate limiting** on `POST /auth/login` (10/min/IP) | ✅ | [login route](src/app/api/auth/login/route.ts) |
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
- **Rotate `JWT_SECRET`** and set a short **`JWT_TTL`** (e.g. `1h`); add refresh
  tokens for longer sessions. localStorage tokens are XSS-exposed by design
  (the client requires a Bearer token in the body) — keep the TTL short.
- **Swap the in-memory rate limiter** for Upstash Redis (multi-instance/serverless
  safe). The `rateLimit()` signature is unchanged; only the store differs.
- **Storage**: Supabase buckets `logos/covers/gallery/projects` — public read,
  service-role write only.
- Wire **error logging** (Sentry) into the `withErrors` 500 branch.

## Known follow-ups

- reCAPTCHA v3 on the lead form (currently honeypot only) — needs a token field
  added to the frontend payload.
- Hard JWT invalidation on logout (jti denylist) — currently client-side drop.
