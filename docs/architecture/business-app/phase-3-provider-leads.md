# Phase 3 — Provider: leads & completion

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 2 · **Unblocks:** phase 4
**Backend change:** none · **Roles:** PROVIDER

---

## Objective

A provider runs their day from the phone: see leads, open one, contact the
customer, change status, complete the job.

This is the first phase with standalone user value. If the project stopped here,
a provider would still get something worth installing.

## Scope

**In:** overview KPIs, lead list with filter/search/pagination, lead detail,
status changes, the completion flow.

**Out:** chat (phase 5), catalog (phase 7), realtime (phase 4 — this phase uses
focus refetch and interval polling only).

---

## Screens

### `(provider)/overview`

KPI row from `ApiLeadStats` — `total`, `byStatus`, and the `recent` trailing-window
delta — plus the five newest leads and an unread-thread count placeholder.

`byCompany` is empty and `catalog` is absent on the provider endpoint; do not
render tiles for them.

### `(provider)/leads`

The core screen. Filter by status, free-text search, pull-to-refresh, infinite
scroll, focus refetch when stale. Row action opens a status sheet.

### `lead/[id]`

Customer block (name, phone with tel/WhatsApp actions, district), service,
`items[]` with **snapshot** prices, estimate range, `hasOnInspection` notice, and
the completion block when present.

> Prices in `items[]` are snapshots from submission time and are never
> recomputed. A later price change must not rewrite what this customer was
> quoted — render them as recorded, never re-derive from the current catalog.

### `lead/[id]/complete`

Final amount + additional-work selection + summary. The **only** path to
`Completed` for a provider.

---

## APIs

| Method | Route | Guard | Purpose |
|--------|-------|-------|---------|
| GET | `/provider/stats` | `providerOnly` | `ApiLeadStats`, own company. **400 if no `companyId`.** |
| GET | `/provider/leads` | `providerOnly` | `ApiPage<ApiLead>`. Query via `parseLeadListQuery`: `page`, `pageSize`, `status`, `search`. Returns an **empty page** (not an error) when the user has no company. |
| GET | `/provider/leads/[id]` | `providerOnly` | One `ApiLead`. 404 unknown, 403 other company. |
| PATCH | `/leads/[id]` | `authed` | `{ status }` → `ApiLead`. Ownership checked for non-admins. |
| POST | `/provider/leads/[id]/complete` | `providerOnly` | `ApiLeadCompletionPayload` → completion record. |

### The completion rule, from the code

`PATCH /leads/[id]` calls `leadsService.updateStatus(id, status, { requireCompletion: !isAdmin })`.
A provider **cannot** set `Completed` directly — they must go through
`POST /provider/leads/[id]/complete` so the final amount is captured and the
customer's verification gate can fire.

**In the UI:** hide `Completed` from the provider's status sheet entirely and
route that intent to the completion screen. Do not let the user discover the rule
by getting an error.

---

## Components

`LeadRow`, `StatusPill`, `StatusSheet`, `FilterBar`, `KpiTile`, `ItemsTable`,
`MoneyField`, `ListSkeleton`, `EmptyCard`, `ErrorCard`.

Build these to be reused by the admin lead screens in phase 8 — same row, same
pill, different data source. Keep them free of `/provider/*` assumptions.

## State

- `leadsStore` — paged list + filter state + `fetchedAt`.
- `statsStore` — `ApiLeadStats` + `fetchedAt`.
- Last-used filter persisted to AsyncStorage.

Refetch on focus when stale. Interval polling as the placeholder until phase 4
replaces it with SSE invalidation (and then *slows* rather than removes it).

## Realtime / push

None yet. Phase 4 wires `lead` and `lead-status` into these stores.

---

## Tasks

| # | Task |
|---|------|
| 3.1 | `lib/leads.ts` — typed callers for list, one, PATCH status, complete. Types from `@alassema/core`. |
| 3.2 | `leadsStore` with filter + pagination and a `fetchedAt` stamp. |
| 3.3 | Components listed above, built role-agnostic. |
| 3.4 | Leads screen: pull-to-refresh, infinite scroll, focus refetch, filter bar, search. |
| 3.5 | Status sheet with `Completed` hidden for providers and routed to completion. |
| 3.6 | Lead detail with tel/WhatsApp actions and the items table. |
| 3.7 | Completion screen with a confirm dialog that **names the consequence**. |
| 3.8 | Overview with KPI tiles and the newest five leads. |
| 3.9 | Handle the no-`companyId` provider: explanatory state on both screens, not an error card. |
| 3.10 | Tests + a full device pass over the flow. |

## Tests

Unit: filter/pagination reducer; the status-transition rule (provider cannot
reach `Completed`); currency formatting in EGP whole pounds; snapshot prices
render as recorded.

Integration: `PATCH /leads/[id]` to `Completed` as a provider is rejected;
another company's lead id returns 403; an unknown id returns 404.

Device: the whole flow end to end against a local API with seeded data.

## Definition of done

- [ ] A provider views, filters, searches, paginates, opens, contacts,
      re-statuses and completes a lead.
- [ ] `Completed` is unreachable from the status sheet and reachable from the
      completion screen.
- [ ] A provider with no company sees an explanation, not an error.
- [ ] Every screen has verified loading, empty, error and offline states.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Completion has real financial consequences** — it opens the customer's verification gate and feeds commission recognition | Confirm before submitting; show the amount unambiguously; never auto-submit. |
| Search or filter state lost on refocus | Persist to AsyncStorage; restore on mount. |
| A lead not in the fetched page | Solved server-side by `GET /provider/leads/[id]` — always fetch detail by id, never read it out of the list cache. |
| Long Arabic customer names or descriptions overflowing rows | Truncate with an accessible full value on the detail screen. |
| Phone actions on a device with no dialler | Guard `Linking.canOpenURL` and degrade to copy-to-clipboard. |
