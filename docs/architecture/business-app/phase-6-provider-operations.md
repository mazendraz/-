# Phase 6 — Provider: operations

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 2 (can run in parallel with 4 and 5) · **Unblocks:** phase 7
**Backend change:** none · **Roles:** PROVIDER

---

## Objective

The rest of the provider's day-to-day surface: waiting customers, when the
company is open, the portfolio, and the company profile.

## Scope

**In:** waitlist, availability and busy windows, projects with photo upload,
profile with the change-request flow, Telegram link, password change.

**Out:** offerings and pricing — phase 7. They are a large enough surface to earn
their own phase.

---

## Screens

### `waitlist`

Customers waiting for this company. Actions: notify, remove. Status values come
from `ApiWaitlistStatus` — `WAITING | NOTIFIED | CONVERTED | CANCELLED`.

### `availability`

Two mechanisms, and the screen must make the difference obvious:

- **Manual toggle** — open/closed now, via `PATCH /provider/availability`.
- **Scheduled busy windows** — from/to ranges that close and reopen the company
  automatically, via `/provider/busy-windows`.

### `projects`

Portfolio gallery. Add with a photo via `POST /provider/upload`, then
`POST /provider/projects`. Submissions carry `ApiProjectStatus` —
`PENDING | APPROVED | REJECTED` — and wait for admin approval.

The empty state must explain the approval wait, or a provider will think the
upload failed.

### `profile`

Company profile, read-only, **with edits filed as change requests**.

> This is the platform's model, not a limitation to hide: `POST /provider/change-requests`
> files a request and an admin approves it before anything goes public. Design the
> pending state **first**. Understated, it reads as "my edit vanished".

### `settings`

Telegram link/unlink, password change, sign-out, the devices list from
[phase 0](phase-0-backend-sessions.md)'s `/auth/sessions`.

---

## APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/provider/waitlist` | `ApiPage<ApiWaitlistEntry>` |
| PATCH · DELETE | `/provider/waitlist/[id]` | `ApiWaitlistStatusPatch` · remove |
| PATCH | `/provider/availability` | `ApiAvailabilityPayload` |
| GET · POST | `/provider/busy-windows` | list · create |
| DELETE | `/provider/busy-windows/[id]` | remove |
| GET · POST | `/provider/projects` | list · create |
| DELETE | `/provider/projects/[id]` | remove |
| POST | `/provider/upload` | image upload |
| GET | `/provider/profile` | own company profile |
| GET · POST | `/provider/change-requests` | list own · file one |
| GET | `/provider/change-requests/[id]` | one request |
| GET · DELETE | `/provider/telegram` | link status · unlink |
| GET | `/provider/telegram/link` | produce a link URL |
| POST | `/auth/password` | change own password (moves `tokensValidFrom`) |
| GET · DELETE | `/auth/sessions` | devices list · revoke |

All `providerOnly` except the two `/auth/*` routes, which are `withAuth`.

---

## Components

`WaitlistRow`, `AvailabilityToggle`, `BusyWindowRow`, `DateRangePicker`,
`ProjectCard`, `ImageUploader`, `PendingChangeBanner`, `ConfirmSheet`.

Use `expo-image` for every uploaded photo — **not** React Native's `Image`.
Uploaded images are WebP and RN's `Image` has no iOS WebP decoder.

## State

Per-domain stores with `fetchedAt`, same pattern as phase 3. Nothing here is
realtime; focus refetch is sufficient.

---

## Tasks

| # | Task |
|---|------|
| 6.1 | `lib/waitlist.ts`, `lib/availability.ts`, `lib/projects.ts`, `lib/profile.ts`. |
| 6.2 | Waitlist screen with notify/remove and a confirm on remove. |
| 6.3 | Availability toggle with optimistic state and rollback on failure. |
| 6.4 | Busy-window list, create and delete, with **overlap validation before submit**. |
| 6.5 | Projects grid; camera and library upload through `provider/upload`; `expo-image` throughout. |
| 6.6 | Pending/approved/rejected project states rendered distinctly. |
| 6.7 | Profile screen with a prominent `PendingChangeBanner` when a request is open. |
| 6.8 | Change-request form + list of the provider's own requests with their outcomes. |
| 6.9 | Settings: Telegram link (opens a browser), password change, sessions list, sign-out. |
| 6.10 | Tests + device pass, including a real photo upload on both platforms. |

## Tests

Unit: busy-window overlap detection; date handling across the day boundary in the
server's timezone; availability optimistic rollback.

Integration: another company's waitlist entry id returns 403; an oversized upload
returns `PAYLOAD_TOO_LARGE` and is surfaced as readable Arabic copy.

Device: photo upload from camera and from library, on both platforms; the
Telegram link opens and returns correctly.

## Definition of done

- [ ] A provider manages waitlist, availability, busy windows, portfolio and
      profile without opening the web dashboard.
- [ ] A filed change request is visibly pending until an admin acts.
- [ ] Uploaded WebP images render on iOS.
- [ ] Every screen has verified loading, empty, error and offline states.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **The change-request model reads as data loss** | Design the pending state first, not last. Show what was requested, when, and that it is awaiting review. |
| WebP on iOS | `expo-image` only. This is a known, already-hit failure in this project. |
| Overlapping busy windows | Validate client-side before submit **and** trust the server's rejection; do not rely on the client alone. |
| Timezone drift on scheduled windows | The server resolves buckets in its own zone. Send explicit timestamps; never assume the device zone matches. |
| Telegram link opened in an in-app browser that cannot complete | The client app already hit this. Open in the system browser. |
| A large photo on a slow connection | Show upload progress; allow cancel; enforce a client-side size guard before the request. |
