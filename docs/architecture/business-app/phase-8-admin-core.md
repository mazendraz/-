# Phase 8 — Admin: core

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 4 (**requires B3**) · **Unblocks:** phases 9, 10, 11, 12
**Backend change:** B6 · **Roles:** ADMIN

---

## Objective

The admin half of the app opens: platform overview, all-company leads, and
platform-wide chat.

## Scope

**In:** admin tab group, overview, leads list and detail, chat with admin-only
controls, companies directory (read).

**Out:** moderation queue (phase 9), company editing and catalog (phase 10),
platform settings and team (phase 11), Control Center modules (phase 12).

---

## The constraint that shapes this phase

> `providerOnly = withRole("PROVIDER")` tests **strict equality**. An `ADMIN`
> receives **403 on every `/api/provider/*` route.**

Every screen here is built on `/api/admin/*`. Components from phases 3 and 5 are
reused, but their **data modules are swapped**, not extended. This is why
`lib/leads.ts` and `lib/chat.ts` were built with a role-selected route prefix.

---

## Backend change — B6

**Problem.** There is no admin single-lead read. `PATCH /leads/[id]` is the only
method on that path; `DELETE /admin/leads/[id]` is the only method on that one.
An admin lead-detail screen would have to find its lead inside a paginated list —
the exact failure that `provider/leads/[id]`'s own comment was written to fix.

**Change.** Add `GET /admin/leads/[id]` (`adminOnly`) returning `ApiLead` via the
existing `leadsService.getById`. A new method on an existing path; nothing else
changes.

---

## Screens

### `(admin)/overview`

`ApiLeadStats` with the admin-only fields populated: `byCompany` (top companies
with leads, completed and conversion) and `catalog` (companies, activeCompanies,
categories). Plus the `recent` trailing-window delta and the `perDay`/`perMonth`
series.

Note `catalog` is counted server-side precisely because the admin company cache is
a clamped page — do not derive company counts from a list length.

### `(admin)/leads`

All leads, filter by company and status, search, paginate.

Admin status rules differ from the provider's: an admin **may** set `Completed`
directly (`requireCompletion: !isAdmin`), and may delete a lead. Both are
destructive-adjacent — confirm before acting.

### `lead/[id]` (admin variant)

Same component as phase 3, sourced from `GET /admin/leads/[id]`, with the admin
action set: full status range, delete, open thread.

### `(admin)/messages` and `chat/[conversationId]`

Every thread platform-wide, via `AdminListQuery`. Reuses phase 5's components with
two additional controls:

- **Hide a message** — `PATCH /admin/chat/[conversationId]/messages/[messageId]`
  (corrected from an earlier draft of this doc, which had this as a DELETE —
  the actual route hides in place via `{ hidden: boolean }`, so the message
  stays in the table and stays visible to admins; nothing is destroyed)
- **Close a thread** — `PATCH /admin/chat/[conversationId]`

Both must not render for a provider.

### `(admin)/companies`

Directory with search and status filter. Read-only here; editing is phase 10.

> **Correction (found live):** `ApiCompany` never actually serializes a
> `status` field (ACTIVE/INACTIVE/SUSPENDED lives on the Prisma row and on
> `GET /admin/companies`'s `?status=` query filter, but `serializeCompanyAdmin`
> doesn't put it on the response). The status filter still works — it narrows
> which companies come back — but this phase's list rows cannot show a
> per-company status badge, since the app has nothing to render one from. Not
> worth a backend change for a read-only directory in this phase; revisit
> alongside phase 10's status-change control, which will need the field
> serialized regardless.

---

## APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/admin/stats` | `ApiLeadStats` with `byCompany` + `catalog` |
| GET | `/admin/leads` | `ApiPage<ApiLead>`, all companies |
| GET | `/admin/leads/[id]` | **B6 — new.** One `ApiLead` |
| DELETE | `/admin/leads/[id]` | Hard delete |
| PATCH | `/leads/[id]` | Status; admins may set `Completed` |
| GET | `/admin/chat` | `AdminListQuery` → `ApiPage<ApiConversation>` |
| GET · POST | `/admin/chat/[conversationId]` | Read thread · send as admin |
| PATCH | `/admin/chat/[conversationId]` | Close / reopen |
| PATCH | `/admin/chat/[conversationId]/messages/[messageId]` | Hide/unhide a message (`{ hidden }`) — corrected, see above |
| GET | `/admin/companies` | `ApiPage<ApiCompany>` |
| GET | `/admin/search` | Cross-entity search — `ApiSearchResponse` |

All `adminOnly` except `PATCH /leads/[id]` (`authed`) and `/admin/search`.

> **Correction (found live):** `/admin/search` is `adminOnly`, but each of its
> five categories is ALSO independently gated behind a specific
> `desktopPermissions` grant (`business:read`, `operations:read`,
> `finance:read` — see the route's own `CATEGORY_PERMISSION` map). An admin
> with no desktop permissions at all — the default for a freshly created
> admin account, including this repo's `e2e-admin` seed user — gets a 200
> with an EMPTY results array for every query, not an error. The screen must
> treat this as a normal empty state, not surface it as a bug; there is
> nothing here for a plain admin account to unlock without a permissions
> grant, which is a phase-11/Control-Center concern, not this phase's.

## Realtime

The admin subscribes to `ADMIN_CHANNEL` through the same `/provider/stream`
endpoint — the route adds `admins` when `role === "ADMIN"`.

**B3 must already be shipped.** Without it the `admins` channel caps at 8
connections shared across every admin, and admin phones will be refused.

`lead` and `message` both reach `admins`; `lead-status` does after B4.

---

## Tasks

| # | Task |
|---|------|
| 8.1 | **B6** — `GET /admin/leads/[id]` with a test. |
| 8.2 | Verify B3 is deployed; add a two-admin connection test if not already present. |
| 8.3 | Extend `lib/leads.ts` and `lib/chat.ts` with the admin route prefix. |
| 8.4 | `(admin)/_layout` tab bar. |
| 8.5 | Admin overview with `byCompany` and `catalog` tiles plus the series chart. |
| 8.6 | Admin leads list with company + status filters and search. |
| 8.7 | Admin lead detail reusing phase 3's component, with the full status range and delete behind a confirm. |
| 8.8 | Admin thread list and thread view reusing phase 5's components. |
| 8.9 | Hide-message and close-thread controls, admin-gated. |
| 8.10 | Companies directory (read) with search and status filter. |
| 8.11 | Global search screen backed by `/admin/search`. |
| 8.12 | Tests + device pass. |

## Tests

Integration — the important ones:

- A **PROVIDER** token returns 403 on every admin route touched in this phase.
- An **ADMIN** token returns 403 on `/provider/leads` (confirming the constraint
  and that no screen depends on it).
- Admin `PATCH /leads/[id]` to `Completed` succeeds where a provider's fails.
- `DELETE /admin/leads/[id]` removes the lead and its thread.

Unit: `byCompany` conversion rendering; the empty-`byCompany` case (so the same
tile component works on the provider overview).

Device: two admins connected simultaneously both receive live events (the B3
regression, verified for real).

## Definition of done

- [ ] An admin sees platform stats, browses and filters all leads, opens one,
      changes its status and deletes it.
- [ ] An admin reads and answers any thread, hides a message and closes a thread.
- [ ] Live events reach an admin phone while a web admin dashboard is also open.
- [ ] No provider can reach any admin screen or route.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **B3 not shipped** | Admin realtime silently fails once a few dashboards are open. Verify before starting, not after. |
| Reusing a provider component that calls a provider route | The 403 will look like a permissions bug in the app. Keep route selection in the data module, never in the component. |
| Deleting a lead | Irreversible and cascades to its conversation. Confirm with the ref number typed or a clear two-step. |
| Admin setting `Completed` directly | Bypasses the provider's amount capture. Warn in the confirm copy that no final amount will be recorded. |
| Platform-wide lists are large | Server-side pagination and search only. Never fetch to filter locally. |
