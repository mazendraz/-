# Phase 12 — Control Center modules

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 8 · **Unblocks:** nothing
**Backend change:** none · **Roles:** ADMIN **and** a `desktopPermissions` grant

---

## Objective

Field access to the Business Control Center data — finance, clients, provider
performance, pricing intelligence, reports — for admins who hold the relevant
permission.

## The decision, and why

There is an **existing Tauri desktop app** at [`desktop/`](../../../desktop/)
that already covers all 19 `desktopOnly` routes across 20+ screens: Finance
Overview, Income, Expenses, Outstanding, Cash Flow, Transactions, Clients,
Providers, Business Performance, Client Analytics, Provider Analytics, Pricing
Intelligence, Operations, Price Verification, Price Discrepancies, Reports,
Settings.

So this phase is **not** a second ledger.

| | Mobile (this phase) | Desktop (`desktop/`) |
|---|---|---|
| Read KPIs, charts, lists | ✅ | ✅ |
| Triage price discrepancies | ✅ | ✅ |
| Transaction **status** transitions (collected / disputed) | ✅ | ✅ |
| Create accounts, categories, manual transactions | ❌ | ✅ |
| Commission settings | ❌ | ✅ |
| Report export | ❌ view only | ✅ |

**Rationale.** Reading a number and acting on one outstanding item are field
tasks. Ledger data entry and financial configuration are desk tasks with an audit
trail, done rarely, on a keyboard, where a mistyped amount is caught before it is
committed. Adding a second write path to the ledger from a phone increases risk
without removing a real constraint.

> If Mazen wants the write surfaces on mobile too, the routes are listed below and
> the phase extends cleanly — this is a recommendation, not a technical limit.

---

## Permissions

`User.desktopPermissions: string[]`, eight values from `withPermission.ts`:

```
overview:read   operations:read   business:read
finance:read    finance:write     analytics:read
reports:read    settings:write
```

`desktopOnly(permission)` requires **ADMIN and** the permission — a `PROVIDER`
can never reach these regardless of what the array holds. Some routes accept any
one of several permissions.

The app must gate every screen here on `hasDesktopPermission()` from
`lib/permissions.ts` and hide the whole section from an admin with an empty
array — which is the common case, since these grants are deliberate.

---

## Screens

| Screen | Permission | Route |
|--------|-----------|-------|
| `control/overview` | `overview:read` \| `analytics:read` | `GET /admin/desktop/overview` |
| `control/operations` | `operations:read` | `GET /admin/desktop/leads`, `/admin/desktop/leads/summary` |
| `control/finance` | `finance:read` \| `analytics:read` | `GET /admin/finance/overview` |
| `control/finance/cash-flow` | `finance:read` | `GET /admin/finance/cash-flow` |
| `control/finance/transactions` | `finance:read` | `GET /admin/finance/transactions` |
| `control/finance/transactions/[id]` | `finance:write` | `PATCH /admin/finance/transactions/[id]` — status only |
| `control/clients` | `business:read` | `GET /admin/clients`, `/admin/clients/overview` |
| `control/providers` | `business:read` \| `analytics:read` | `GET /admin/providers-performance`, `/summary` |
| `control/pricing` | `analytics:read` | `GET /admin/pricing-intelligence`, `/admin/analytics/pricing` |
| `control/reports` | `reports:read` | `GET /admin/reports` |

### `control/overview`

`ApiDesktopOverview`: KPI row with trend percentages, a service-value vs revenue
series, a lead-status funnel, and recent cross-entity activity.

Two details from the type's own comments that the UI must honour: a `null` trend
percent means the previous window was zero — render **"جديد"**, not "0%" or "∞%";
and `series` is uncapped, so the app thins x-axis labels, not the data.

### `control/finance/transactions`

`ApiTransaction` list with `ApiTransactionListQuery` filters (type, status,
category, company, account, search, date range). **Server-side filtering only** —
`finance.service.ts` exists precisely so no client downloads the ledger to filter
it locally.

The one write: `ApiTransactionStatusPatch` — `PENDING → COLLECTED | DISPUTED | VOID`.

> `COMMISSION_INCOME` rows are **only** ever created by the system, via
> `leadCompletion.service.verify → finance.service.recognizeCommission`. Revenue
> can never be hand-entered. Do not offer a create action for that type anywhere.

### `control/reports`

`ApiReportType` — eight report types, each a flat table reshaped from an existing
service. Rows are capped at 100 and `truncated` tells you when the report is not
the full data set. **Surface `truncated` explicitly** — never let a partial report
read as everything.

---

## Components

`KpiTrendTile` (with the `null` → "جديد" rule), `SeriesChart`, `FunnelBar`,
`ActivityRow`, `TransactionRow`, `StatusTransitionSheet`, `FilterSheet`,
`ReportTable` (horizontally scrollable), `TruncatedNotice`, `PermissionGate`.

Charts should be simple and legible on a phone — a sparkline-grade area chart with
an emphasized endpoint beats a dense desktop chart shrunk down.

## State

Per-module stores with `fetchedAt`. Nothing here is realtime; these are reporting
surfaces. Focus refetch with a longer stale window than the operational screens.

---

## Tasks

| # | Task |
|---|------|
| 12.1 | `PermissionGate` component and route-level guards from `hasDesktopPermission`. |
| 12.2 | Hide the whole Control Center section when the permission array is empty. |
| 12.3 | `lib/control*.ts` modules per area, typed from `@alassema/core`. |
| 12.4 | Overview with KPI trend tiles, series chart, funnel and activity feed. |
| 12.5 | Implement the `null`-trend rule and label thinning. |
| 12.6 | Operations screen from `/admin/desktop/leads` + summary. |
| 12.7 | Finance overview and cash-flow charts. |
| 12.8 | Transactions list with **server-side** filters and search. |
| 12.9 | Transaction status transitions behind `finance:write`, with a confirm. |
| 12.10 | Clients and provider-performance screens. |
| 12.11 | Pricing intelligence and pricing analytics. |
| 12.12 | Reports viewer with `truncated` surfaced. |
| 12.13 | Tests + device pass, including an admin with a partial permission set. |

## Tests

Unit: `PermissionGate` for each of the eight permissions and for multi-permission
routes; the `null`-trend rendering rule; `truncated` notice; currency formatting.

Integration: an ADMIN **without** the permission gets 403 (and the app never
renders the screen); a PROVIDER with a hand-set `desktopPermissions` array is
still 403 — `desktopOnly` checks role too; `COMMISSION_INCOME` cannot be created
through any exposed path.

Device: an admin with only `finance:read` sees finance and nothing else, with no
dead nav entries.

## Definition of done

- [ ] Every screen is gated on the correct permission, verified per permission.
- [ ] An admin with no grants sees no Control Center section at all.
- [ ] Financial figures match the desktop app for the same window — check at
      least one KPI and one ledger page side by side.
- [ ] No write path exists for `COMMISSION_INCOME` or for financial configuration.
- [ ] Truncated reports say so.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Financial data on a lock screen or in a screenshot** | Never put figures in a push payload. Revisit the screenshot-blocking question from the security review for these screens specifically. |
| Duplicating the desktop app | Keep to the read-mostly boundary above. If a screen starts growing data entry, it belongs in `desktop/`. |
| Numbers disagreeing with the desktop app | Same endpoints, same service functions — a mismatch means a client-side aggregation crept in. There should be none. |
| Dense tables on a phone | Horizontal scroll inside the table container; the page body must never scroll sideways. |
| An admin with a partial grant seeing dead links | Derive nav from the permission array, not from a static list. |
