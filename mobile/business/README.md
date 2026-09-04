# Al Assema — Business App (Provider & Admin)

> **Package:** `@alassema/mobile-business` · **Platform:** iOS + Android (+ web preview) · **Framework:** Expo SDK 54 (React Native 0.81) · **Language:** Arabic only, RTL forced

The **staff** mobile app for [Al Assema](https://alassema.com). One binary serves both
staff roles:

- **`PROVIDER`** — a service company's own operator: incoming leads, chat with
  customers, availability, waiting list, portfolio, price list, company profile.
- **`ADMIN`** — platform staff: every company's leads and chat, the five-queue
  moderation inbox, company & category management, team and platform settings,
  and a read-mostly view of the Business Control Center.

It talks to the existing `api/` backend over `/api/v1` with a Bearer token. It
introduces **no new backend system** — the provider and admin routes, the staff
SSE stream and native push all pre-date it.

The customer-facing app is a **different** app: [`mobile/client`](../client/README.md).

---

## Table of contents

1. [Status](#status)
2. [Tech stack](#tech-stack)
3. [One app, two roles](#one-app-two-roles)
4. [Project structure](#project-structure)
5. [Navigation & route map](#navigation--route-map)
6. [Roles & permissions](#roles--permissions)
7. [Screens reference — provider](#screens-reference--provider)
8. [Screens reference — admin](#screens-reference--admin)
9. [Business Control Center](#business-control-center)
10. [Data layer](#data-layer)
11. [Authentication & sessions](#authentication--sessions)
12. [Realtime (SSE) & tab badges](#realtime-sse--tab-badges)
13. [Push notifications & deep links](#push-notifications--deep-links)
14. [Resilience gates](#resilience-gates)
15. [RTL, fonts & theming](#rtl-fonts--theming)
16. [Shared packages](#shared-packages)
17. [Environment variables](#environment-variables)
18. [Local development](#local-development)
19. [Build & release](#build--release)
20. [Component library](#component-library)
21. [Key technical decisions & gotchas](#key-technical-decisions--gotchas)
22. [Related documentation](#related-documentation)

---

## Status

Built in 14 planned phases; **phases 0–13 have shipped**, phase 14 (store release)
has not.

| | |
|---|---|
| Routes | 65 screen files under `app/` |
| Components | 59 under `components/` |
| Data modules | 34 under `lib/` |
| Source size | ~15k lines of TS/TSX |
| Crash reporting | Sentry, wired, off until `EXPO_PUBLIC_SENTRY_DSN` is set |
| EAS project | **not yet created** — there is no `eas.json` here; see [Build & release](#build--release) |

Phase history is in the git log (`git log -- mobile/business`) and in
[`docs/architecture/business-app/`](../../docs/architecture/business-app/README.md).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | React Native 0.81 · Hermes |
| Framework | Expo SDK 54 · Expo Router 6 (file-based) |
| Language | TypeScript 5.9, `strict` |
| Storage | `expo-secure-store` (tokens) · `@react-native-async-storage` (settings) |
| Networking | `apiGet/apiPost/apiPatch/apiDelete` from `@alassema/mobile-shared` |
| Realtime | Server-Sent Events, hand-parsed over `expo/fetch` |
| Push | `expo-notifications` (APNs + FCM) |
| Auth | Email + password → JWT access token + 30-day staff refresh token |
| Media | `expo-image` · `expo-image-picker` (gallery uploads) |
| Fonts | Cairo (body) · Alexandria (headings) via `expo-font` |
| Errors | `@sentry/react-native` (scrubbed, role-tagged) |
| Shared logic | `@alassema/core` · `@alassema/mobile-shared` |
| OTA | `expo-updates`, `runtimeVersion.policy: "appVersion"` |

**No** Google/Apple sign-in, **no** Turnstile, **no** i18n framework — staff sign in
with a password, and the UI is Arabic only.

---

## One app, two roles

Locked scope decisions (from
[`docs/architecture/business-app/README.md`](../../docs/architecture/business-app/README.md)
§1 — don't re-litigate without asking Mazen):

| # | Decision | Why |
|---|----------|-----|
| 1 | One app, role-based navigation — not two binaries | The backend already treats staff as one population: one `User` table, one `typ:"staff"` token audience, one `/provider/stream`, one `/push/device`. Two apps = two store listings, two credential sets, two release trains. |
| 2 | SSE, not Supabase Realtime | Documented rejection in `api/src/lib/services/realtime.service.ts`. |
| 3 | Staff **refresh sessions**, not a longer global `JWT_TTL` | Raising `JWT_TTL` also lengthens the web dashboard cookie and mints a 30-day bearer for an account that can delete leads. |
| 4 | Arabic only, RTL forced | Matches `mobile/client`. |
| 5 | Control Center is **read-mostly** on mobile | The Tauri app in [`desktop/`](../../desktop/) already covers the full ledger. Mobile adds field access. |
| 6 | The client app's behaviour must not change | It is deployed and customer-facing. |

---

## Project structure

```
mobile/business/
├── index.ts                  # custom entry — polyfills + configure() BEFORE expo-router
├── app.json                  # Expo config (bundle ids, scheme alassemabiz, plugins)
├── babel.config.js           # + @babel/plugin-transform-class-static-block (required)
├── metro.config.js           # forces ONE react copy in the workspace (see gotchas)
├── scripts/sync-lan-ip.js    # rewrites .env's LAN IP before every dev start
├── app/                      # 65 routes (expo-router, file-based)
│   ├── _layout.tsx           # root: fonts, RTL, session bootstrap, gates, push
│   ├── index.tsx             # the ONE place that decides sign-in vs. role group
│   ├── sign-in.tsx
│   ├── (provider)/           # provider tab group
│   ├── (admin)/              # admin tab group
│   ├── lead/ chat/ …         # shared detail routes (role-agnostic paths)
│   ├── approvals/            # admin moderation detail screens
│   ├── company/ category/    # admin catalog editors
│   ├── settings/ content/ team/
│   └── control/              # Business Control Center modules
├── components/               # 59 shared UI pieces
└── lib/                      # 34 data/state modules
```

### Why `index.ts` is the entry point (not `expo-router/entry`)

`package.json`'s `main` points at `index.ts` so that **three things run before Metro
evaluates anything else**:

1. **`Intl` polyfills.** Hermes ships without `Intl.PluralRules`, and
   `packages/core/src/plural.ts` constructs one **at module load time**. Every route
   file imports `@alassema/core` for `colors`/`type`, so on an engine without it the
   crash cascades into "missing default export" on every screen. Confirmed on a real
   device for `mobile/client`.
2. **`configure()`** — wires this app's `EXPO_PUBLIC_*` values and its **staff-specific
   paths** into `@alassema/mobile-shared` (`refreshPath: /auth/refresh`,
   `streamPath: /provider/stream`, `devicePath: /push/device`,
   `appVersionQuery: "business"`, `mapNotificationUrl`).
3. **`import "expo-router/entry"`** last.

---

## Navigation & route map

`app/index.tsx` is the single routing authority. Everything downstream is a
consistency guard, not a second source of truth:

```
cold start / unmapped deep link
        │
        ▼
   app/index.tsx  ──── no user ────►  /sign-in
        │
        ├── role === ADMIN     ──►  /(admin)/overview
        └── role === PROVIDER  ──►  /(provider)/overview
```

Each tab group's `_layout.tsx` re-checks the role and redirects the wrong one away —
so a stale cross-role deep link lands on that role's own overview instead of a screen
that could only 403.

### Tabs

| Provider | Admin |
|----------|-------|
| الرئيسية · الطلبات · الرسائل · المزيد | الرئيسية · الطلبات · الموافقات · الرسائل · الشركات · المزيد |

`الطلبات` and `الرسائل` carry a live badge; the admin `الموافقات` tab carries a pending
moderation count.

### Full route table

| Route | Title | Role |
|-------|-------|------|
| `/sign-in` | Staff sign-in | — |
| `/(provider)/overview` | الرئيسية | PROVIDER |
| `/(provider)/leads` | الطلبات | PROVIDER |
| `/(provider)/messages` | الرسائل | PROVIDER |
| `/(provider)/more` | المزيد | PROVIDER |
| `/(admin)/overview` | الرئيسية | ADMIN |
| `/(admin)/leads` | الطلبات | ADMIN |
| `/(admin)/approvals` | الموافقات | ADMIN |
| `/(admin)/messages` | الرسائل | ADMIN |
| `/(admin)/companies` | الشركات | ADMIN |
| `/(admin)/more` | المزيد | ADMIN |
| `/lead/[id]` | تفاصيل الطلب | both (data module swapped by role) |
| `/lead/[id]/complete` | إنهاء الطلب | PROVIDER |
| `/chat/[id]` | thread | both (admin gets moderation controls) |
| `/sessions` | الأجهزة والجلسات | both |
| `/waitlist` | قائمة الانتظار | PROVIDER |
| `/availability` | التوفر | PROVIDER |
| `/projects` | معرض الأعمال | PROVIDER |
| `/offerings` · `/offering/[id]` | قائمة الأسعار / تعديل الخدمة | PROVIDER |
| `/bundle-rules` | خصومات الباقات | PROVIDER |
| `/profile` | بيانات الشركة | PROVIDER |
| `/search` | بحث شامل | ADMIN |
| `/categories` · `/category/[id]` | التصنيفات | ADMIN |
| `/platform-waitlist` | قائمة الانتظار (كل الشركات) | ADMIN |
| `/team` · `/team/[id]` | الفريق | ADMIN |
| `/settings` | إعدادات المنصة | ADMIN |
| `/settings/maintenance` | وضع الصيانة | ADMIN |
| `/settings/notifications` | إشعارات الأدمن | ADMIN |
| `/settings/telegram` | تليجرام | ADMIN |
| `/content/pages` | الصفحات القانونية | ADMIN |
| `/content/email-templates` | قوالب البريد الإلكتروني | ADMIN |
| `/audit-log` | سجل الإجراءات | ADMIN |
| `/company/new` | شركة جديدة | ADMIN |
| `/company/[id]` | company editor hub | ADMIN |
| `/company/[id]/status` · `/availability` · `/offerings` · `/offering/[offeringId]` · `/projects` · `/reviews` · `/waitlist` | company sections | ADMIN |
| `/approvals/change-request/[id]` | طلب تعديل | ADMIN |
| `/approvals/project/[id]` | مشروع في معرض الأعمال | ADMIN |
| `/approvals/review/[id]` | تقييم عميل | ADMIN |
| `/approvals/site-review/[id]` | رأي عميل | ADMIN |
| `/approvals/site-review-settings` | إعدادات آراء العملاء | ADMIN |
| `/approvals/feedback/[id]` | رسالة | ADMIN |
| `/control` + 7 modules | لوحة التحكم | ADMIN + desktop permission |

---

## Roles & permissions

### The single most important fact in this app

`providerOnly` on the server is `withRole("PROVIDER")` — **strict equality**, not
"provider or above". An `ADMIN` gets **403 on every `/api/provider/*` route**, with no
fallback. Admin screens are built on `/api/admin/*` or they do not work.

This is why `lib/leads.ts` and `lib/adminLeads.ts` (and `chat.ts` / `adminChat.ts`)
are separate modules rather than one module with a branch, and why `isProvider` and
`isAdmin` are mutually exclusive with no "either" helper.

### Server guards (`api/src/lib/middleware/guards.ts`)

| Guard | Meaning |
|-------|---------|
| `authed` | any staff |
| `adminOnly` | `withRole("ADMIN")` — strict |
| `providerOnly` | `withRole("PROVIDER")` — strict |
| `desktopOnly(permission)` | ADMIN **and** a `User.desktopPermissions` grant |
| `assertOwnership(user, companyId)` | admins bypass; a provider is limited to its own company |

### Client-side (`lib/permissions.ts`) — presentation only

⚠️ These decide which **tabs and controls render**, never whether an action is
allowed. Every one has a real server guard behind it. **Never add a check here with
no server counterpart.**

| Helper | Gate |
|--------|------|
| `isProvider` / `isAdmin` | role, strict |
| `hasCompany` | a provider with no `companyId` has no leads/stats/chat/catalog — an explanatory state, not an error |
| `canCompleteLeads` | provider only — `POST /provider/leads/[id]/complete` |
| `canManageLeadsDirectly` | admin only — delete a lead, set `Completed` via `PATCH /leads/[id]` |
| `canModerateChat` | admin only — hide a message, close/reopen a thread |
| `canModerate` | admin only — the five approval queues |
| `canManageCompanies` / `canManageTeam` / `canManagePlatformSettings` | admin only |
| `hasDesktopPermission(user, perm)` | admin **and** the grant; accepts a list where any one suffices |
| `hasAnyDesktopPermission` | whether the Control Center entry renders at all |

`DESKTOP_PERMISSIONS` mirrors the server's list exactly: `overview:read`,
`operations:read`, `business:read`, `finance:read`, `finance:write`, `analytics:read`,
`reports:read`, `settings:write`.

---

## Screens reference — provider

| Screen | What it does |
|--------|--------------|
| **الرئيسية** (`overview`) | KPI tiles from `GET /provider/stats` — إجمالي الطلبات (with a period-over-period delta, `null` when the previous window was zero), جديد / قيد التنفيذ / مكتمل — plus the newest leads. Shows an explanatory card when the account has no company linked. |
| **الطلبات** (`leads`) | Paged lead list with status filters, live-refetched on SSE `lead` events. |
| **تفاصيل الطلب** (`/lead/[id]`) | Customer, request details, line items, final amount; status transitions; opens the lead's conversation. |
| **إنهاء الطلب** (`/lead/[id]/complete`) | The **only** path a provider has to `Completed`. Captures the final amount and opens the customer's price-verification gate (confirm/dispute) — irreversible, so it sits behind a confirm that names the consequence. |
| **الرسائل** + `/chat/[id]` | Company threads, most recently active first; composer, live message events. |
| **قائمة الانتظار** (`/waitlist`) | Customers who joined while the company was busy. Any status may move to any other; `CONVERTED` creates a **real Lead** server-side from the entry's snapshot and is not reversible in practice — confirm before sending it. |
| **التوفر** (`/availability`) | Manual open/closed toggle (immediate, no change-request gate) plus scheduled busy windows. |
| **معرض الأعمال** (`/projects`) | Portfolio. New projects are always created `PENDING`; editing an already-approved project sends it back to `PENDING` — server-enforced. Image upload via `expo-image-picker`. |
| **قائمة الأسعار** (`/offerings`, `/offering/[id]`) | Offerings with pricing tiers, publish state and visibility. |
| **خصومات الباقات** (`/bundle-rules`) | Create + list only — the API has no provider-facing edit/delete for a bundle rule. Created as `DRAFT`; a discount reaches customers, so it waits for review. |
| **بيانات الشركة** (`/profile`) | Company fields. Most edits go through a **ChangeRequest** (admin approval) rather than writing directly — the screen shows a pending-change banner for fields already awaiting review. |
| **الأجهزة والجلسات** (`/sessions`) | See [Authentication](#authentication--sessions). |

## Screens reference — admin

| Screen | What it does |
|--------|--------------|
| **الرئيسية** (`overview`) | Platform KPIs from `GET /admin/stats` (leads by status + شركات نشطة / تصنيفات), newest leads, and a **maintenance banner** when maintenance mode is on. |
| **الطلبات** (`leads`) | All companies' leads, with a company picker (a text field + tap-to-select row, not a modal picker library) and status filters. Admin-only actions: delete a lead, set `Completed` directly. |
| **الموافقات** (`approvals`) | The five moderation queues behind one segmented control: **طلبات التعديل** · **المشاريع** · **التقييمات** · **آراء العملاء** · **الرسائل**, each with its own pending count. Detail screens approve/reject with a note; the change-request detail shows a server-computed diff plus `conflicts` / `entityMissing` against the live row. |
| **الرسائل** + `/chat/[id]` | Every company's threads, searchable by lead ref / customer / company. Admin-only controls: hide a message, close/reopen a thread. |
| **الشركات** (`companies`) | Directory with a server-side status filter. A row can't show *which* status it matched — `ApiCompany` doesn't serialize `status` — the detail screen reads/sets it in its own section. |
| **Company editor** (`/company/[id]/…`) | Hub + sections: حالة · التوفر وفترات الانشغال · قائمة الأسعار (+ offering editor) · معرض الأعمال · التقييمات · قائمة الانتظار (read-only). Admin catalog edits are written **directly** — no change-request gate, unlike a provider's. |
| **التصنيفات** (`/categories`, `/category/[id]`) | Category CRUD. `PUT /admin/categories/[id]` is a **full replace** — always build the payload from a freshly fetched record. |
| **بحث شامل** (`/search`) | Cross-entity search over Control Center data, permission-filtered server-side. `result.path` is a **desktop** route and is not navigable here; only `category: "request"` carries an id this app has a screen for. An empty result set is a normal outcome. |
| **الفريق** (`/team`, `/team/[id]`) | Staff accounts: create, edit role, grant desktop permissions, deactivate, delete. |
| **إعدادات المنصة** (`/settings`) | Site name, support email, public phone, address, social links, districts, budgets, hero copy (ar/en), logo/favicon/hero image. Sub-sections: **وضع الصيانة**, **إشعارات الأدمن**, **تليجرام** (mints a single-use `t.me` link, valid 15 minutes, opened in the system browser). All five settings PUTs are genuine partial updates. |
| **الصفحات القانونية** / **قوالب البريد** (`/content/*`) | Markdown editor for legal pages; email template editing. |
| **سجل الإجراءات** (`/audit-log`) | `GET /admin/audit-logs`, newest first, filterable by entity/action. |
| **قائمة الانتظار (كل الشركات)** (`/platform-waitlist`) | Platform-wide, read-only. |

---

## Business Control Center

Seven read-mostly modules under `/control`, each gated on a desktop permission. The
hub's nav is **derived from the signed-in admin's own `desktopPermissions`** so a
partial grant never shows a dead link, and the whole entry is hidden in المزيد when
the array is empty.

| Module | Route | Permission (any of) |
|--------|-------|---------------------|
| نظرة عامة | `/control/overview` | `overview:read`, `analytics:read` |
| العمليات | `/control/operations` | `operations:read` |
| المالية | `/control/finance` (+ `cash-flow`, `transactions`, `transactions/[id]`) | `finance:read`, `analytics:read` |
| العملاء | `/control/clients` | `business:read`, `analytics:read` |
| أداء مقدّمي الخدمة | `/control/providers` | `business:read`, `analytics:read` |
| تحليلات الأسعار | `/control/pricing` | `analytics:read` |
| التقارير | `/control/reports` | `reports:read` |

Reports are **view-only** here — one fetch backs both preview and the desktop app's
CSV export, so a preview can never disagree with what would be exported, but this app
offers no export/share action.

---

## Data layer

No Redux, no Zustand, no React Query. State is either local `useState` or a
module-level store exposed through `useSyncExternalStore` (`lib/liveBadges.ts`,
`lib/approvalsStore.ts`, `lib/staffAuth.ts`). Screens refetch on focus
(`useRefreshOnFocus`, used by 32 routes) and on SSE events.

### `lib/` modules by API prefix

| Prefix | Modules |
|--------|---------|
| `/auth/*` | `staffAuth.ts` |
| `/provider/*` | `leads.ts`, `chat.ts`, `offerings.ts`, `projects.ts`, `availability.ts`, `waitlist.ts`, `bundleRules.ts`, `profile.ts` |
| `/admin/*` | `adminLeads.ts`, `adminChat.ts`, `adminCompanies.ts`, `adminCategories.ts`, `adminTeam.ts`, `adminSettings.ts`, `adminContent.ts`, `adminAudit.ts`, `adminWaitlist.ts`, `adminSearch.ts`, `adminTelegram.ts`, `adminUpload.ts`, `approvals.ts` |
| `/admin/*` (desktopOnly) | `controlOverview.ts`, `controlOperations.ts`, `controlFinance.ts`, `controlClients.ts`, `controlProviders.ts`, `controlPricing.ts`, `controlReports.ts` |
| shared `/leads/[id]` | used by both roles for the status PATCH |
| local | `permissions.ts`, `liveBadges.ts`, `approvalsStore.ts`, `deepLinks.ts`, `money.ts` |

### Types

Import from **`@alassema/core`** — never redeclare an API shape. It exports `ApiLead`,
`ApiPage`, `ApiLeadStats`, `ApiOffering`, `ApiCompany`, `ApiAdminUser`,
`ApiConversation`, `ApiMessage`, the finance/reporting types, plus the M3 `colors` /
`type` design tokens generated from the website's `tailwind.config.js`.

A handful of shapes are **server-internal** (Prisma enums, service-local interfaces —
`ChangeEntity`, busy-window shapes, the approval queues' joined "admin item" types).
Those are mirrored locally in the `lib/` module that needs them, with a comment saying
where they came from, rather than exported from `@alassema/core`.

### Error contract

Uniform `ApiErrorBody { code, message, details? }`: `VALIDATION_ERROR` (400, `details`
is `Record<field, string[]>`), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND`
(404), `CONFLICT` (409), `RATE_LIMIT` (429), `MAINTENANCE` (503).

### The shared screen contract

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton rows matching the final layout on first load; inline progress on refetch. Never a full-screen spinner over content already on screen. |
| Empty | Arabic copy naming the absent thing plus the one action that changes it. Never a bare `لا توجد نتائج`. |
| Error | Inline retry card keyed on `ApiError.status`: 401 → session gate; 403 → `ليس لديك صلاحية`; 429 → the server's retry-after copy verbatim; 0/5xx → the shared offline path. |
| Offline | `useBackendHealth` raises `OfflineScreen` above the tree; per-screen, the last good payload stays rendered under a stale banner. |
| Realtime | An SSE event **invalidates and refetches** — it never carries data. Interval refetch stays wired and is *slowed* when connected, never switched off. |

---

## Authentication & sessions

```
POST /auth/login { email, password, device }
        │
        ├── token         → SecureStore (short-lived access JWT)
        └── refreshToken  → SecureStore (30-day staff session)
                                  │
   401 on any call ──► POST /auth/refresh ──► new access token
                                  └── rejected ──► invalidateSession() ──► sign-in
```

- **Sending `device` is what makes the server issue a refresh token at all.** The web
  dashboard omits it and gets only a cookie. `platform` is sent only when it really is
  `ios`/`android` — under `expo start --web` it's omitted rather than lying, because the
  API's `deviceSchema` is `z.enum(["ios","android"])`.
- Tokens live in **`expo-secure-store`** (iOS Keychain / Android Keystore), never
  AsyncStorage — wrong tier of trust for a 30-day credential.
- `lib/staffAuth.ts` owns **who** is signed in and broadcasts changes;
  `@alassema/mobile-shared`'s `session.ts` owns the **bytes on disk**.
- `bootstrapSession()` runs once at launch (`GET /auth/me`). A network failure is *not*
  evidence of a dead session — it shows sign-in without clearing a still-good one.
- **Sign-out** unregisters this phone's push token **first** (that route needs auth),
  then `POST /auth/logout` with the refresh token so the server revokes the session
  rather than leaving a live 30-day credential behind.
- **`/sessions`** lists live sessions (`GET /auth/sessions`) and revokes one or all.
  Two honest limitations, both server-side facts the copy states plainly: the list has
  no "this device" marker (the API returns none), and "end all" has no
  "except the caller" carve-out — it signs this device out too.
- **No self-registration, no third-party sign-in.** Accounts are provisioned by an
  admin on the الفريق screen.

---

## Realtime (SSE) & tab badges

- **One** connection for the whole app, at module scope in
  `@alassema/mobile-shared/liveEvents.ts`, fanned out in-process to every
  `useLiveEvents()` caller. (An earlier per-component version held 2–4 simultaneous
  streams per session.)
- Hand-parsed over `expo/fetch`'s streaming body — React Native has no `EventSource`
  global. SSE's wire format is `data: <json>\n\n`; there is no protocol complexity a
  library would be hiding.
- Both roles subscribe through the **same** route, `GET /provider/stream`. The server
  derives the channel list (this company vs. `admins`) from the authenticated session,
  **never** from a request param.
- Reconnects on its own — not only on a background→foreground transition, but also
  after a proxy idle timeout, a network blip, or an API restart.
- **Badges** (`lib/liveBadges.ts`) are a live-session tally, deliberately *not* server
  state — there is no unread-count endpoint. Reset on cold start and whenever the tab
  is opened. One subscription per tab group's layout, not one per screen.
- The **الموافقات** badge is different: the five moderation queues have no SSE event, so
  `approvalsStore` polls every **3 minutes** — often enough to stay roughly honest,
  far too slow to matter as load.

> Known, accepted gap: viewing a specific thread at `/chat/[id]` still bumps the
> Messages badge for an event on that same conversation — the check only knows about
> tab routes, not detail routes layered above them. Mildly redundant, never wrong.

---

## Push notifications & deep links

- `expo-notifications`; the token is upserted at **`POST /push/device`** — the route
  api's own comments call "the BUSINESS app (staff)". Re-registering every launch is
  free and is what stops a re-signed-in phone from notifying the previous account.
- Foreground presentation: banner + list, no sound, badge applied.
- **Deep links need translation.** Server push payloads name *web dashboard* paths
  (`/provider`, `/provider?tab=messages`, `/admin`, `/admin?tab=chat`) because the same
  payloads also reach browsers via Web Push. `lib/deepLinks.ts` is the one place that
  maps them onto native routes; anything unmapped falls through to `/`, which is
  `app/index.tsx`'s role-aware redirect — the correct universal fallback, since this
  function has no role information to guess with.
- URL scheme: **`alassemabiz`** (the client app is `alassema`).

---

## Resilience gates

Rendered by `app/_layout.tsx`, above the route tree, in this order:

| Gate | Source | Behaviour |
|------|--------|-----------|
| Fonts + session bootstrap | local | Splash is held until **both** resolve, so the first frame is already correct — no font flash, no wrong-screen flash. |
| Forced update | `GET /app-version?app=business` | `UpdateRequiredScreen` with store links. Best-effort and non-blocking: a slow or failed check never blocks the app. |
| Backend offline | `useBackendHealth` | `OfflineScreen`. |
| Crash | expo-router `ErrorBoundary` export | `CrashScreen` (deliberately dependency-free) + `reportError` to Sentry from the boundary, not from the component. |

**There is deliberately no maintenance gate.** The API's maintenance middleware exempts
every `/provider/*` and `/admin/*` route by design — those dashboards stay usable
during maintenance, which is the point. Blocking staff would lock out the one person
who can turn maintenance back off. Maintenance is surfaced as a **banner** on the admin
overview instead.

Sentry (`initErrorReporting`) no-ops entirely until `EXPO_PUBLIC_SENTRY_DSN` is set —
no network call either way. Events are scrubbed before transport (no tokens, passwords,
phone numbers or financial figures) and tagged with role + app version.

---

## RTL, fonts & theming

- `ensureRTL()` runs at module scope in the root layout, **before the first screen
  mounts** — it cannot be deferred to a component effect.
- Layout uses `flexDirection: "row-reverse"` and `textStart` (from
  `@alassema/mobile-shared`) rather than hardcoded `left`/`right`.
- Fonts: **Cairo** (400/500/600/700) for body and labels, **Alexandria** (700) for
  titles, loaded through `useAppFonts()`.
- Colors and the type scale come from `@alassema/core`'s `colors` / `type` — the same M3
  tokens the website generates. Brand primary is `#005578`.
- On web (`expo start --web`) the app renders inside a 480px-wide phone frame.

---

## Shared packages

| Package | Contents |
|---------|----------|
| **`@alassema/core`** | API contract types, validation, pricing logic, `colors`/`type` tokens, `plural.ts`. Shared with `api/`, `app/` and `mobile/client`. |
| **`@alassema/mobile-shared`** | `config` · `session` · `api` · `liveEvents` · `push` · `appVersion` · `rtl` · `fonts` · `backendHealth` · `maintenance` · `useRefreshOnFocus` · `errorReporting` · `settings` · `assetUrl`. Extracted from `mobile/client` in phase 1 as a behaviour-preserving move. |

UI components were **not** extracted: the client app is a consumer browsing surface,
this is a dense operational one. The two apps share tokens, not markup.

---

## Environment variables

Copy `.env.example` → `.env` (gitignored).

| Var | Notes |
|-----|-------|
| `EXPO_PUBLIC_API_URL` | **Absolute**, with the versioned prefix. Local: `http://192.168.1.X:3000/api/v1` (LAN IP, never `localhost` — the app runs on the phone). Prod: `https://alassema.com/api/v1`. |
| `EXPO_PUBLIC_ASSET_URL` | Origin serving root-relative media. **Blank in production** (single-origin deploy); a LAN IP pointing at the website dev server locally. |
| `EXPO_PUBLIC_API_KEY` | Optional shared gate matching the backend's `API_KEY`. Unset on the server today. Leave blank unless the server side is configured too. |
| `EXPO_PUBLIC_SENTRY_DSN` | Blank = crash reporting fully off. |

No Google / Apple / Turnstile keys here on purpose.

---

## Local development

```bash
# from the repo root — workspaces are already installed by npm install
docker compose -f api/docker-compose.dev.yml up -d   # local DB on :5433
npm run dev:api                                       # backend on :3000

cd mobile/business
npm start          # prestart re-derives the LAN IP into .env automatically
npm run android    # or: npm run ios / npm run web
npm run typecheck  # tsc --noEmit
npm run bundle:check
```

- `scripts/sync-lan-ip.js` rewrites `.env`'s LAN IP before every dev start.
  `EXPO_PUBLIC_*` values are **baked into the bundle at build time**, and Windows Wi-Fi
  renews the machine's IP on nearly every reconnect — without this the app silently
  can't reach the API or load a single image.
- **Never `npm install <pkg>` by name in this repo** — hand-edit `package.json` and run
  a bare `npm install`, or Expo packages silently downgrade.
- **Web-only verification cannot catch native-Hermes bugs.** A physical-device smoke
  test after every ship is mandatory.
- Ship with `npm run ship -- "message"` from the repo root. No rebase, no force-push,
  no new branches.
- ⚠️ Read [`CLAUDE.md`](../../CLAUDE.md) before any DB command — local vs. production
  `DATABASE_URL` is a hard rule with a real incident behind it.

---

## Build & release

**Phase 14 has not been done.** There is no `eas.json` in this directory yet and no EAS
project. What phase 14 specifies:

| Item | Client app (shipped) | Business app |
|------|---------------------|--------------|
| EAS project | `ed93c3b0-…` | **new** — `eas init` |
| Slug | `alassema-client` | `alassema-business` |
| iOS bundle / Android package | `com.alassema.client` | `com.alassema.business` |
| Scheme | `alassema` | `alassemabiz` |
| Icon | Consumer brand | **visually distinct** — two Al Assema icons on one home screen must be tellable apart |
| Store | Public | Public listing, sign-in only, no self-registration |

Build profiles mirror `mobile/client/eas.json`: **development** (dev client, internal,
physical device), **preview** (internal, channel `preview`), **production** (channel
`production`, `autoIncrement: true`). Each carries its own `env` block with the
production `EXPO_PUBLIC_API_URL`. **Do not** copy the client app's Google/Apple/Turnstile
keys across.

Credentials: the Apple team, App Store Connect API key and Google Play service account
are reusable and live **outside the repo** at `C:\Users\CM\.alassema-secrets\`. A new
Apple App ID (`com.alassema.business`, push capability enabled) and a new Play listing
are needed. Sign in with Apple is **not** required — staff authenticate with a password
and the app offers no third-party sign-in.

OTA: `expo-updates` with `runtimeVersion.policy: "appVersion"`, so a JS-only fix ships
over the air within one native version and a native change forces a new build.

---

## Component library

59 components in `components/`. The recurring ones:

| Group | Components |
|-------|-----------|
| Shell | `ScreenHeader`, `MoreScreen`, `CompanySectionNav`, `PlaceholderScreen` |
| States | `ListStates` (`ListSkeleton`, `EmptyCard`, `ErrorCard`), `OfflineScreen`, `CrashScreen`, `UpdateRequiredScreen`, `MaintenanceScreen`, `MaintenanceBanner`, `TruncatedNotice` |
| Forms | `TextField`, `Button`, `MoneyField`, `PriceFields`, `PricingModeSelector`, `RoleSelector`, `MarkdownEditor`, `FilterBar`, `DangerConfirm` |
| Leads & chat | `LeadRow`, `LeadsChart`, `FunnelBar`, `StatusPill`, `StatusSheet`, `StatusTransitionSheet`, `MessageBubble`, `Composer`, `ThreadRow` |
| Moderation | `QueueSegments`, `ApprovalRow`, `ApproveRejectBar`, `RejectNoteSheet`, `DiffBlock`, `PendingChangeBanner`, `WaitingFor` |
| Catalog | `CompanyForm`, `CategoryForm`, `CategoryRow`, `OfferingRow`, `TierRow`, `GalleryManager`, `PhotoPreview`, `ProjectCard`, `PublishStateChip` |
| Ops | `AvailabilityToggle`, `BusyWindowRow`, `WaitlistRow`, `RatingStars` |
| Data display | `KpiTile`, `SeriesChart`, `ReportTable`, `ItemsTable`, `TransactionRow`, `ActivityRow`, `UserRow`, `PermissionChecklist`, `PermissionGate` |

---

## Key technical decisions & gotchas

1. **`metro.config.js` forces one React copy.** npm workspaces can leave a second,
   physically separate `react`/`react-dom`/`scheduler` in the tree — even at the
   identical version — which breaks React's hooks-dispatcher singleton ("Invalid hook
   call" inside `useFonts`, dispatcher `null`, confirmed on a real device).
   `resolver.extraNodeModules` does **not** fix this: it's only a fallback Metro
   consults when resolution *fails*, and here both copies resolve fine.
   `resolveRequest` is the one API that intercepts every resolution.
2. **`babel.config.js` needs `@babel/plugin-transform-class-static-block`.** Without it
   the app does not bundle at all — a hard `TransformError` on the first import, because
   `@formatjs` ships modern syntax that `babel-preset-expo` doesn't transform inside
   `node_modules` and Hermes can't parse.
3. **"List is the only read."** Several entities have no single-item GET route
   (projects, reviews, site reviews, feedback, transactions). Those detail screens read
   the item back out of the list payload rather than inventing an endpoint.
4. **`PUT` on companies and categories is a full replace.** A partial payload silently
   resets fields, so always build from a freshly fetched record. The five *settings*
   PUTs are the exception — genuinely partial, hand-written `.optional()` fields, no
   Zod defaults.
5. **Uploads** go to `POST /admin/upload` (multipart: `file`, `bucket`) with `bucket` in
   `logos | covers | gallery | projects`; anything else 400s. Video only in `gallery`.
6. **Photos are WebP.** Use `expo-image`, never React Native's `Image` — the latter has
   no iOS WebP decoder.
7. **Provider edits are gated, admin edits are not.** A provider's profile/catalog change
   becomes a `ChangeRequest` awaiting approval; an admin writes the same field directly.
   That asymmetry is intentional and lives in the route choice, not in the UI.

---

## Related documentation

| Doc | What's in it |
|-----|--------------|
| [`docs/architecture/business-app/README.md`](../../docs/architecture/business-app/README.md) | The build plan's shared context — locked decisions, phase index, conventions |
| `docs/architecture/business-app/phase-0…14-*.md` | One file per phase: goal, steps, files, "done when" |
| [`mobile/client/README.md`](../client/README.md) | The customer app — the precedent most of this app's infrastructure came from |
| [`CLAUDE.md`](../../CLAUDE.md) | Repo rules: shipping, the local-vs-production DB rule, git locks |
| [`README.md`](../../README.md) | Monorepo overview |
