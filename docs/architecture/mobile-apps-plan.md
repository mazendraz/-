# Al Assema — Mobile Apps Execution Plan (Provider/Admin + Client)

> Execution-ready build plan for two React Native (Expo) apps that talk to the
> **existing** `api/` backend and the **existing** Supabase Postgres database —
> no separate backend, no sync job, no second database. Same data source as
> `app/` (the web app), consumed over the same REST API.
>
> This doc is written to be pasted as-is into a fresh Claude Code / agent
> session as a kickoff prompt. It assumes the reader has repo access and has
> read the root [`CLAUDE.md`](../../CLAUDE.md) — **its rules (shipping via
> `npm run ship`, local-only DB migrations, OneDrive git caution) apply to
> every phase below without exception.**

---

## 0. Decisions locked in (do not re-litigate these)

| Question | Decision |
|---|---|
| Client account model | **Guest-only**, same as the website today. No customer login. A lead is identified by `refNumber` + (`trackingToken` or `phone`) — exactly the existing `/api/leads` + `/api/leads/track` contract. |
| Provider/Admin auth | Reuse the existing JWT (`Authorization: Bearer <token>`) — already supported server-side, nothing to build. |
| Realtime chat | **Supabase Realtime from day one**, replacing the current polling-based `Message` reads, for both the web app and both mobile apps. |
| Framework | **React Native + Expo** (managed workflow, EAS Build for binaries, Expo Updates for OTA JS fixes). |
| Push notifications | **Expo Push Notifications** (unifies FCM + APNs) for the two native apps. Existing Web Push (VAPID) stays untouched for the browser dashboard. |
| Structure | Two independent Expo projects at the repo root: `mobile-provider/` (providers + admins) and `mobile-client/` (customers), each its own `package.json`, matching how `api/` and `app/` are already independent packages in this monorepo. |

---

## 1. What already exists (verified against the actual codebase — do not rebuild)

- **Backend:** Next.js API Routes (`api/src/app/api/**`) + Prisma 7 + Supabase Postgres. REST, JSON, no GraphQL.
- **Auth (`api/src/lib/auth.ts`):** JWT (HS256, `jose`), resolved from the `Authorization: Bearer` header **or** an httpOnly cookie — header takes priority, so mobile clients already work against `getAuthUser`/`withAuth`/`withRole` with zero backend change. Token TTL is `JWT_TTL` (default `1d`).
- **Roles:** `UserRole` enum = `ADMIN | PROVIDER` only. There is no customer account model — matches decision above.
- **Provider/Admin endpoints already live:** `/api/admin/*` (companies, categories, leads, users, reviews, projects, waitlist, site-reviews, settings, email templates, maintenance) and `/api/provider/*` (leads, availability, projects, waitlist, telegram). All role-gated via `withRole`/`assertOwnership`.
- **Guest lead flow already live:** `POST /api/leads` (public, rate-limited, honeypot + captcha) and `GET /api/leads/track?ref=&token=&phone=` (public, rate-limited). This is the entire "client" surface today — no login anywhere.
- **Chat:** `Conversation` + `Message` models exist, one thread per `Lead`, keyed by the lead's `trackingToken` for customer access (no account). Current read pattern is a poll: `WHERE conversationId=? AND createdAt > ?`. No websockets/Realtime wired yet.
- **Push:** `api/src/lib/services/push.service.ts` — Web Push (VAPID) only, keyed to `PushSubscription.userId`. Fails open by design (never blocks the action that triggered it). There is no notion of a customer-side push target today (customers have no `userId`).
- **Deploy:** VPS behind Caddy + PM2, `deploy/deploy.sh`. See `CLAUDE.md` for the production-DB safety rules — they apply unchanged to any migration this plan requires.

---

## 2. Backend additions required (small, additive, non-breaking)

All of these are additive migrations — nothing above is removed or renamed, so the existing web app keeps working unmodified throughout.

1. **Mobile session lifetime.** Add a longer-lived or refreshable token path for native apps without shortening the web session. Simplest option: a distinct `MOBILE_JWT_TTL` env (e.g. `30d`) used only by a new `POST /api/auth/mobile-login` (or a `client=mobile` flag on the existing login route) — same `signToken`, longer `exp`. Revocation still works the same way (`isActive=false` on the user).
2. **Native push device tokens.** New table, e.g. `DeviceToken { id, userId, expoPushToken, platform (IOS|ANDROID), createdAt }`, parallel to `PushSubscription` (do not repurpose that table — its shape is web-push-specific). Extend `notifyUser`/`notifyAdmins`/`notifyCompanyProviders` in `push.service.ts` to fan out to both `PushSubscription` (web) and `DeviceToken` (native) — same fail-open contract.
3. **Guest push targeting for the client app.** Since customers have no `userId`, add a `LeadDeviceToken { id, leadId, expoPushToken, platform, createdAt }` linked to `Lead` instead of `User`. Registered by the client app right after a lead is submitted or a tracking session is opened (proven by `trackingToken`, same gate as `/api/leads/track`). Used to push "your request was accepted / provider replied" notifications without an account.
4. **Supabase Realtime enablement.** Turn on Realtime (logical replication) for the `Message` table (and optionally `Lead.status` if you want live status-change updates on the client's tracking screen too). This is a Supabase project setting + a `supabase_realtime` publication entry — no Prisma schema change needed for the table itself, only RLS/publication config. Since the API currently writes through Prisma with the service-role connection, confirm the publication is enabled at the database level (via the Supabase dashboard or `ALTER PUBLICATION supabase_realtime ADD TABLE "Message";`).
5. **Realtime auth boundary.** Decide how a Realtime subscription is scoped per conversation without exposing every message row: either (a) front the subscription with a short-lived signed channel token minted by an authenticated/tracking-gated API route, or (b) rely on Postgres RLS policies keyed to the lead's `trackingToken`/`companyId` if the client connects directly with a Supabase anon key. Given the app currently does all DB access through Prisma with a service key (not Supabase client-side auth), **(a) is the lower-risk fit for this codebase** — keep Realtime consumption server-mediated where practical, or scope tightly with RLS if connecting directly.

**Do not touch:** `LeadStatus`, `UserRole` (stays `ADMIN|PROVIDER`), the guest lead-submission contract, `Company`/`Project`/`Review`/`Offering` models — none of this plan requires changes there.

---

## 3. Repo structure additions

```
العاصمة/
├── api/                 (existing — gets the additive changes in §2)
├── app/                 (existing web app — unchanged)
├── mobile-provider/     (NEW — Expo app for PROVIDER + ADMIN roles)
├── mobile-client/       (NEW — Expo app for guest customers)
├── deploy/
├── design/
└── docs/
    └── architecture/
        └── mobile-apps-plan.md   (this file)
```

Each mobile app is its own Expo project (`npx create-expo-app`), own `package.json`, own EAS config — independent, like `api/` and `app/` already are. No shared workspace tooling needed for v1; keep an API-types file in each app manually mirrored from `app/src/lib/apiTypes.ts` (or generate it with a small copy script under `scripts/`) rather than introducing a monorepo package manager change.

---

## 4. Phases

### Phase 0 — Mobile foundations
**Goal:** Both Expo projects boot, can hit `GET /api/health`, and have a typed API client.
**Steps:**
1. Scaffold `mobile-provider/` and `mobile-client/` with Expo + TypeScript template.
2. Add `expo-secure-store` (token storage), a thin `apiClient.ts` (fetch wrapper: base URL from env, attaches `Authorization: Bearer` when present, typed responses mirroring `api/src/lib/apiTypes.ts`).
3. Wire `.env`/`app.config.ts` per app for `API_BASE_URL` (dev: LAN IP + `:3000`; prod: the deployed domain).
4. Confirm CORS is a non-issue (native fetch isn't browser-origin-restricted) — no API change needed here, just verify against the deployed HTTPS domain.
**Done when:** both apps show a working "ping health endpoint" screen against the running local `api/`.

### Phase 1 — Backend additions
**Goal:** §2 items 1–3 implemented and migrated **locally only** (per `CLAUDE.md` — `docker compose -f api/docker-compose.dev.yml up -d`, `prisma migrate dev`, never against production).
**Steps:**
1. Add `DeviceToken` and `LeadDeviceToken` Prisma models + migration.
2. Add mobile login/token-TTL path.
3. Extend `push.service.ts` to dispatch to Expo Push (using `expo-server-sdk`) in addition to web-push, for both user-scoped and lead-scoped targets.
4. Add `POST /api/push/mobile-subscribe` (authenticated, for provider/admin) and `POST /api/leads/track/push-subscribe` (guest, gated by ref+token, for the client app).
**Done when:** a test push round-trips end to end from a seeded local user/lead to an Expo push token (use Expo's push tool or a physical/simulator device).

### Phase 2 — Provider/Admin app MVP
**Goal:** Feature-complete provider + admin dashboard, mobile-native, reusing existing endpoints as-is.
**Steps:**
1. Login screen → `POST /api/auth/*` (mobile variant from Phase 1) → store JWT in SecureStore.
2. Provider views: leads list/detail + status update (`/api/provider/leads`, `/api/leads/[id]` PATCH), availability, projects, waitlist, telegram link — one screen per existing endpoint group.
3. Admin views: same pattern across `/api/admin/*` (companies, users, leads, categories, reviews, site-reviews, settings) — scope to what's actually needed on mobile first (leads + companies + moderation triage are the highest-value screens; defer bulk-admin screens like email templates to later if desired).
4. Wire push notifications (Phase 1 subscribe endpoint) for new leads / new chat messages, mirroring what `notifyCompanyProviders`/`notifyAdmins` already trigger for web push.
5. Role-based navigation: same JWT payload already carries `role` + `companyId` — branch the app's tab bar on that.
**Done when:** a provider and an admin can each fully log in and perform their core daily tasks (view/update leads, respond to waitlist, see notifications) without touching the web dashboard.

### Phase 3 — Client app MVP
**Goal:** Guest customer app matching the current web guest flow, native.
**Steps:**
1. Browse: categories/companies listing + company profile (`/api/categories`, `/api/companies`, `/api/companies/[slug]`) — read-only, public, no auth.
2. Submit request: multi-step form → `POST /api/leads` (same validation/rate-limit contract as web).
3. Track request: enter `refNumber` + phone (or deep-linked `trackingToken`) → `GET /api/leads/track` — persist the ref+token locally (SecureStore/AsyncStorage) so returning to the app doesn't require re-entering it.
4. Register for push right after submit/track, via the Phase 1 lead-scoped endpoint — no login required.
5. Chat: customer side of `Conversation`/`Message`, gated the same way as the web (tracking token) — see Phase 4 for the realtime wiring.
**Done when:** a customer can submit a request, come back later, see its status, and chat with the provider — all without ever creating an account.

### Phase 4 — Realtime chat (Supabase Realtime)
**Goal:** Replace polling with live updates for chat, on web + both mobile apps.
**Steps:**
1. Enable the `Message` table on the `supabase_realtime` publication (§2.4).
2. Decide and implement the auth boundary from §2.5 (signed channel token minted server-side is the recommended default for this codebase).
3. Add a Realtime subscription hook shared in spirit (implemented per-app since there's no shared package yet) that both `mobile-provider` and `mobile-client` use for their open conversation screen; do the same in `app/` to retire its poll.
4. Fall back to the existing poll if a Realtime connection can't be established (offline/backgrounded resilience) — don't remove the poll code, just stop it from being the primary path.
**Done when:** a message sent from one side appears on the other within ~1s without a manual refresh, on web and both apps, and reconnects cleanly after a network drop.

### Phase 5 — Hardening & release
**Goal:** Store-ready builds.
**Steps:**
1. Icons/splash/app names/bundle identifiers for both apps (distinct from each other and from any existing web PWA assets).
2. EAS Build config (`eas.json`) for both apps — dev/preview/production profiles.
3. Crash/error reporting (Sentry or equivalent) wired in both apps.
4. Expo Updates channel setup so JS-level fixes ship without a store resubmission.
5. Store listings (Apple App Store + Google Play) — privacy policy, data-use disclosures (note: client app collects phone/name for leads, location/district text, chat content; provider/admin app collects staff credentials).
**Done when:** both apps have a signed production build installable via EAS/TestFlight/internal testing track.

---

## 5. Open items to confirm before/while building (not blocking Phase 0–1)

- Exact scope of admin screens included in the mobile admin app v1 (recommend: leads + companies + moderation only; defer settings/email-templates/audit-log to a later phase or leave those web-only).
- SMS/notification copy for push messages (title/body per event type: new lead, status change, new chat message).
- Whether the client app needs offline caching of "my requests" (recommend: yes, minimal — cache the last-fetched tracked lead(s) locally so the status screen isn't blank offline).

---

## 6. Guardrails carried over from `CLAUDE.md` (apply throughout)

- Any `prisma migrate` / seed / schema change happens against the **local** dev DB (`docker compose -f api/docker-compose.dev.yml up -d`) — never production. Verify `DATABASE_URL` before running anything destructive.
- Ship with `npm run ship -- "message"` only. No rebase, no force-push, no new branches unless explicitly requested.
- Watch for OneDrive git lock issues (`index.lock`) per the existing playbook in `CLAUDE.md`.
