# Al Assema — Backend Build Plan (Execution Phases)

> Execution-ready, top-to-bottom build plan for the Al Assema backend.
> Each phase is self-contained: **Goal → Steps → Files → Done when**.
> Run phases in order; do not start a phase until the previous one's
> "Done when" checks pass.
>
> Contract source of truth: [backend-plan.md](backend-plan.md) (architecture &
> schema) + [app/src/lib/apiTypes.ts](app/src/lib/apiTypes.ts) (response shapes).
> Stack: **Next.js API Routes · Supabase (Postgres + Auth + Storage) · Prisma**.

---

## Phase 0 — Project Setup & Foundations

**Goal:** A running Next.js + Prisma + Supabase skeleton with env wired and a
clean folder structure.

**Steps:**
1. Scaffold the API project:
   ```bash
   npx create-next-app@latest api --ts --app --eslint --src-dir --no-tailwind
   cd api
   npm i @prisma/client zod
   npm i -D prisma
   npm i @supabase/supabase-js
   npx prisma init
   ```
2. Create the folder structure under `src/lib`:
   `prisma.ts`, `supabase.ts`, `auth.ts`, `validation/`, `services/`,
   `middleware/`, `utils/` (per [backend-plan.md](backend-plan.md) §2).
3. Add `.env` with all keys from [backend-plan.md](backend-plan.md) §13
   (`DATABASE_URL`, `DIRECT_URL`, Supabase keys, `JWT_SECRET`, etc.).
4. Create the Prisma client singleton (`src/lib/prisma.ts`) and the Supabase
   server client (`src/lib/supabase.ts`).
5. Configure CORS to allow the site origin + `Authorization` and `X-Api-Key`
   headers (Next.js middleware or per-route headers).

**Files:** `src/lib/prisma.ts`, `src/lib/supabase.ts`, `.env`, `.env.example`,
`next.config.js` (CORS), `prisma/schema.prisma` (datasource only).

**Done when:** `npm run dev` boots, `npx prisma validate` passes, and a
`GET /api/health` route returns `{ "ok": true }`.

---

## Phase 1 — Database Schema & Migrations

**Goal:** The full data model live in Postgres, matching the frontend contract.

**Steps:**
1. Paste the complete schema from [backend-plan.md](backend-plan.md) §3 into
   `prisma/schema.prisma`: enums (`CompanyStatus`, `LeadStatus`, `UserRole`) and
   models (`Category`, `Company`, `Project`, `Review`, `Lead`, `User`).
2. Verify the field-level contract matches §16:
   - `Project.img` (string), `Project.year` (string).
   - `Review.author`, `Review.district`, `Review.avatar`.
   - `Category.label` + `Category.cover`.
   - `Lead.refNumber`, `service`, `district`, `budget`, 5-value status.
   - `Company` has `tagline, about, cover, services[], gallery[], badges[],
     location, yearsExperience, responseTime, verifiedSince, completedProjects,
     rating, reviewCount, featured, verified`.
3. Generate and apply the migration:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

**Files:** `prisma/schema.prisma`, `prisma/migrations/**`.

**Done when:** `npx prisma migrate dev` succeeds, `npx prisma studio` shows all
six tables, and `prisma generate` produces a typed client.

---

## Phase 2 — Core Utilities & Service Layer Skeleton

**Goal:** Shared building blocks so every route stays thin.

**Steps:**
1. **Response helpers** (`src/lib/utils/response.ts`):
   - `ok(data)` → raw object/array (single items return RAW, no envelope).
   - `page(data, { total, page, pageSize })` → `ApiPage<T>` shape.
   - `fail(code, message, status, details?)` → flat `ApiErrorBody`
     (`{ code, message, details }`) with the matching HTTP status.
2. **Errors** (`src/lib/utils/errors.ts`): `AppError` + `NotFoundError`,
   `ValidationError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError`,
   `ConflictError` (per [backend-plan.md](backend-plan.md) §10).
3. **Central error wrapper**: a `withErrors(handler)` that catches `AppError`
   (and unknown errors → 500 `INTERNAL_ERROR`) and serializes via `fail()`.
   Never leak internal details. Log to Sentry in production.
4. **Helpers**: `slug.ts` (`slugify`, `uniqueSlug`), `refNumber.ts`
   (`AA-YYYYMMDD-XXXX`), `serialize.ts` (DateTime → epoch ms for `Lead.createdAt`;
   derive `company.category`/`categoryLabel` and `lead.companySlug`/`companyName`).
5. **Service stubs**: `categories.service.ts`, `companies.service.ts`,
   `projects.service.ts`, `reviews.service.ts`, `leads.service.ts`,
   `upload.service.ts` — each exporting typed functions returning contract shapes.

**Files:** `src/lib/utils/*`, `src/lib/services/*.ts`.

**Done when:** Unit tests for `slugify`, `refNumber`, the serializer, and
`response`/`fail` shapes pass (Vitest).

---

## Phase 3 — Public Read Endpoints

**Goal:** The customer-facing catalog is fully readable from the API.

**Steps:**
1. `GET /api/categories` → `ApiCategory[]` (active only, live `count` of ACTIVE
   companies). Map `cover` → `cover`, `label` → `label`.
2. `GET /api/companies` → `ApiPage<ApiCompany>` with query support:
   `page, pageSize, category, search, minRating, sort` (recommended | rating |
   projects | reviews | name). ACTIVE only.
3. `GET /api/categories/[slug]/companies` → same shape, filtered by category.
4. `GET /api/companies/[slug]` → RAW `ApiCompany` (full profile incl. `services`,
   `gallery`, `projects`, `reviews`, `badges`, `rating`, `reviewCount`,
   `completedProjects`, `category`, `categoryLabel`). `404` if not ACTIVE.
5. Implement read logic in `companies.service.ts` / `categories.service.ts`;
   routes only parse query → call service → `ok()`/`page()`.

**Files:** `src/app/api/categories/**`, `src/app/api/companies/**`,
service read functions.

**Done when:** Each endpoint returns the exact contract shape (verified against
[apiTypes.ts](app/src/lib/apiTypes.ts)); SUSPENDED/INACTIVE companies are hidden;
pagination meta uses `{ total, page, pageSize }`.

---

## Phase 4 — Lead Submission (Public Core Flow) ⭐

**Goal:** The conversion path: a customer submits a service request.

**Steps:**
1. `createLeadSchema` (Zod) per [backend-plan.md](backend-plan.md) §6 — validates
   `ApiLeadPayload` (`companySlug, companyName, service, name, phone, district,
   budget, description`) with Egyptian phone regex.
2. `POST /api/leads` (`leads.service.create`):
   - Resolve company by `companySlug`; reject if missing or not ACTIVE.
   - Generate `refNumber`, set `status = NEW`.
   - Persist, then return the **full RAW `ApiLead`** with `createdAt` as epoch ms.
3. Wire rate limiting (5 req/min/IP — Upstash Redis, or in-memory for dev) and
   bot protection (reCAPTCHA v3 or honeypot) on this route only.

**Files:** `src/lib/validation/leads.ts`, `src/app/api/leads/route.ts`,
`src/lib/middleware/rateLimit.ts`, `leads.service.ts`.

**Done when:** Submitting to an ACTIVE company returns `201` + a full `ApiLead`
(with `refNumber`, numeric `createdAt`); submitting to a SUSPENDED company fails;
hammering the endpoint trips `RATE_LIMITED`. Matches `addLead()` in
[requests.ts](app/src/lib/requests.ts).

---

## Phase 5 — Auth & Middleware

**Goal:** Login + protected-route plumbing.

**Steps:**
1. `POST /api/auth/login` (email + password) → `{ token, user }`. **Return the
   JWT in the body** (the client stores it in `localStorage` as
   `al-assema-token` and sends `Authorization: Bearer <token>` — see
   [api.ts](app/src/lib/api.ts)). Hash passwords with argon2/bcrypt, or delegate
   to Supabase Auth and re-issue a JWT.
2. `POST /api/auth/logout` (invalidate token) and `GET /api/auth/me`
   (current user).
3. Middleware (`src/lib/middleware/`): `withAuth` (401 if no valid token),
   `withRole(role)` (403), and an ownership check helper.
4. Optional `X-Api-Key` gate (`VITE_API_KEY`).

**Files:** `src/app/api/auth/**`, `src/lib/auth.ts`,
`src/lib/middleware/{withAuth,withRole}.ts`.

**Done when:** Login returns a usable Bearer token; `/auth/me` resolves the user
from the header; protected routes reject missing/invalid tokens with the correct
codes.

---

## Phase 6 — Admin Endpoints (Catalog CRUD)

**Goal:** The admin dashboard can fully manage the catalog.

**Steps:**
1. `upsertCompanySchema` (Zod) per §6, covering all `ApiCompany` input fields.
2. **Categories:** `GET/POST /api/admin/categories`,
   `PUT/DELETE /api/admin/categories/[id]` (auto-slug from `label`; DELETE fails
   if the category has companies → `CONFLICT`).
3. **Companies:** `GET/POST /api/admin/companies`,
   `PUT/DELETE /api/admin/companies/[id]`,
   `PATCH /api/admin/companies/[id]/status` (ACTIVE/INACTIVE/SUSPENDED).
4. **Projects:** `POST /api/admin/companies/[id]/projects`,
   `DELETE /api/admin/companies/[id]/projects/[projectId]`.
5. **Reviews:** `POST /api/admin/companies/[id]/reviews`,
   `DELETE /api/admin/companies/[id]/reviews/[reviewId]` — **recompute
   `rating` + `reviewCount`** in `reviews.service` on every add/delete (mirrors
   `addReview` in [catalog.ts](app/src/lib/catalog.ts)).
6. All admin routes wrapped in `withAuth(withRole("ADMIN", ...))`.

**Files:** `src/app/api/admin/categories/**`, `src/app/api/admin/companies/**`,
`src/lib/validation/companies.ts`, `companies/projects/reviews` services.

**Done when:** Full CRUD works; deleting a non-empty category fails; adding a
5-star review bumps the company's aggregate `rating`/`reviewCount` correctly.

---

## Phase 7 — Image Upload & Storage

**Goal:** Admins upload images and get back URLs to store on entities.

**Steps:**
1. Create Supabase Storage buckets: `logos`, `covers`, `gallery`, `projects`
   (or one bucket with folders). Public read; admin-only write.
2. `POST /api/admin/upload` (admin only): accept a file, resize + compress
   (max ~1200px, WebP/JPEG, ≤ 5MB), upload to Storage, return `{ url }`.
3. Admin UI sets the returned URL into `logo` / `cover` / `gallery[]` /
   `project.img`.
4. (Optional migration aid) Accept data URLs in image fields temporarily, since
   the current frontend produces them via [image.ts](app/src/lib/image.ts).

**Files:** `src/app/api/admin/upload/route.ts`, `upload.service.ts`.

**Done when:** Uploading returns a public URL that renders; oversized/invalid
files are rejected; non-admins get `403`.

---

## Phase 8 — Provider Endpoints & Lead Management

**Goal:** Providers see and progress their own leads; admins manage all leads.

**Steps:**
1. `GET /api/provider/leads` (role PROVIDER) → `ApiPage<ApiLead>` filtered by
   `lead.companyId === user.companyId`; supports `?status=&page=&pageSize=`
   (status by label, e.g. "In Progress").
2. `PATCH /api/leads/[id]` → `ApiLeadStatusPatch` (`{ status }`). Provider:
   ownership-checked; Admin: any lead. Returns updated RAW `ApiLead`.
3. `GET /api/admin/leads` → `ApiPage<ApiLead>` (filter by company/status/date).
4. `DELETE /api/admin/leads/[id]` (admin only).
5. Map the `LeadStatus` enum ↔ display labels on the boundary
   (`NEW` ↔ "New", `IN_PROGRESS` ↔ "In Progress", …).

**Files:** `src/app/api/provider/leads/route.ts`,
`src/app/api/leads/[id]/route.ts`, `src/app/api/admin/leads/**`.

**Done when:** A provider can only see/patch their own company's leads
(cross-company access → 403/404); status labels round-trip correctly; admin sees
all leads and can delete.

---

## Phase 9 — Seed Data & Frontend Cutover

**Goal:** Populate the DB from the existing seed and switch the frontend to live.

**Steps:**
1. Write `prisma/seed.ts` that imports the seed arrays from
   [data.ts](app/src/lib/data.ts) (`SERVICE_CATEGORIES`, `COMPANIES` with their
   nested `projects`/`reviews`) and inserts categories → companies → projects →
   reviews, recomputing aggregates.
   ```bash
   npx prisma db seed
   ```
2. In the frontend, set `VITE_API_URL` (and optional `VITE_API_KEY`) in
   `.env.local`.
3. Swap the `localStorage` bodies in [catalog.ts](app/src/lib/catalog.ts) and
   [requests.ts](app/src/lib/requests.ts) for `apiFetch` calls behind
   `isApiConfigured()` — page/component signatures stay unchanged (per
   [FRONTEND.md](app/FRONTEND.md) §10). `addLead` already branches on the API.

**Files:** `prisma/seed.ts`, `package.json` (`prisma.seed`), frontend
`.env.local`, `catalog.ts`, `requests.ts`.

**Done when:** With `VITE_API_URL` set, the live site lists seeded companies,
opens a profile, and a submitted request appears via `GET /admin/leads`.

---

## Phase 10 — Security, Testing & Hardening

**Goal:** Production-ready guarantees.

**Steps:**
1. **Security pass** ([backend-plan.md](backend-plan.md) §8): rate limits on
   `/leads` + `/auth/login`, input sanitization (strip HTML in descriptions),
   CORS locked to the site origin, short-lived JWT, no internal error leakage,
   secrets only in env.
2. **Tests** ([backend-plan.md](backend-plan.md) §12):
   - Unit (Vitest): service layer, validation, utils, aggregate recompute.
   - Integration (Vitest + Supertest): routes against a test DB.
   - E2E (Playwright): customer journey + admin journey.
   - Snapshot the JSON shapes against `ApiPage` / raw object / `ApiErrorBody`.
3. **Key scenarios:** ACTIVE submit succeeds (returns `refNumber` + epoch
   `createdAt`); SUSPENDED submit fails; provider can't see another company's
   leads; deleting a non-empty category fails; add/delete review recomputes
   aggregates; rate limit trips.

**Files:** `tests/**`, CI config.

**Done when:** All suites green in CI, security checklist complete, contract
snapshots match [apiTypes.ts](app/src/lib/apiTypes.ts).

---

## Phase 11 — Notifications (Post-MVP)

**Goal:** Notify providers on new leads.

**Steps:**
1. On `POST /leads` success, enqueue an **email** to the provider (Resend /
   Supabase) with lead details.
2. Optional **WhatsApp/SMS** (Twilio / WhatsApp Business API).
3. Until then, providers poll/refresh the dashboard.

**Files:** `notifications.service.ts`, lead-create hook.

**Done when:** A new lead triggers a provider email in production.

---

## Dependency Order (quick reference)

```
0 Setup
└─ 1 Schema
   └─ 2 Utils/Services
      ├─ 3 Public reads ─┐
      ├─ 4 Lead submit ──┤
      └─ 5 Auth ─────────┤
                         ├─ 6 Admin CRUD ─ 7 Upload
                         └─ 8 Provider/Leads
                            └─ 9 Seed + Cutover
                               └─ 10 Security/Tests
                                  └─ 11 Notifications (post-MVP)
```

**MVP = Phases 0–10.** Phase 11 is post-launch.
