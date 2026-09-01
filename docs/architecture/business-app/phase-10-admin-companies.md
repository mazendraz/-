# Phase 10 — Admin: companies & catalog

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 8 · **Unblocks:** nothing
**Backend change:** none · **Roles:** ADMIN

---

## Objective

Full administrative control over companies and the service catalog: create and
edit a company, manage its offerings, projects, reviews, waitlist and
availability, and manage the category tree.

## Scope

**In:** company CRUD, status, per-company sub-resources, admin-side offerings,
categories.

**Out:** commission (`desktopOnly`, phase 12), moderation queues (phase 9),
platform settings (phase 11).

---

## Screens

### `(admin)/companies` → `company/[id]`

The directory from phase 8 becomes a full detail screen with sections. Each
section is its own sub-route so a deep link can open one directly.

| Section | Purpose |
|---------|---------|
| Profile | Name, slug, description, logo, gallery, contact, district, category links |
| Status | Active / suspended, via `PATCH /admin/companies/[id]/status` |
| Availability | Open/closed and busy windows — the admin equivalent of phase 6 |
| Offerings | The company's price list, **edited directly** — no change request |
| Projects | Add on the company's behalf |
| Reviews | Add or moderate reviews on this company |
| Waitlist | Read the company's waiting customers |

> `ApiReview` never serializes an `approved` flag (same gap phase 9 already
> found and documented) — a review row here can't show whether it's
> already approved. The "موافقة" action is offered unconditionally instead
> of as a toggle; it's idempotent, so tapping it on an already-approved
> review is harmless.

> **Correction (found live):** there is no `GET /admin/companies/[id]` at
> all — confirmed against the actual route file, which exports only
> `PUT`/`DELETE`. The company detail screen (and every sub-section) reads
> one company by paging `GET /admin/companies` (pageSize 100) and finding
> the row by id — the same "list is the only read" pattern already used for
> offerings/projects/reviews/feedback in earlier phases. That list's own
> query eagerly loads the full relations for every row, so this is a
> complete read, not a degraded one; the real ceiling is scale (~100
> companies before this needs a real GET-by-id route, which the platform is
> nowhere near yet).
>
> Also: `GET /admin/companies/[id]/availability` doesn't exist either — the
> route file exports only `PATCH`. Current availability state comes from
> the company detail's own `busy`/`busyUntil`/`busyNote` fields, same
> pattern the provider's own availability screen (phase 6) already uses for
> the identical reason.

### `admin/companies/new` (built as `/company/new`)

Create a company via `POST /admin/companies`. (Route path corrected to
match this app's established flat top-level-route convention — see
`/offering/new` from phase 7 — rather than an `admin/`-prefixed path,
which nothing else in this app uses.)

### `(admin)/categories` → `categories/[id]`

The service tree. `ApiAdminCategory` extends `ApiCategory` with admin-only
fields. Note `ApiCategoryPricingMode` — `QUOTE_ONLY | FIXED_CATALOG` — which
determines whether companies in that category present a priced catalog at all.
Changing it changes how the public request flow behaves; treat it as a
significant action, not a toggle.

---

## The asymmetry with phase 7

| | Provider (phase 7) | Admin (this phase) |
|---|---|---|
| Create offering | Always a draft | Direct — `POST /admin/companies/[id]/offerings` |
| Edit | Change request for published rows | Direct — `PATCH .../offerings/[offeringId]` |
| Publish | Files `ChangeRequest{PUBLISH}` | Direct |
| Visibility | Immediate | Immediate |
| Delete | Draft immediate, published via request | Direct |

An admin edits the catalog **without** the change-request gate. Reuse phase 7's
form components, swap the data module, and make the immediacy visible in the UI —
an admin needs to know their edit is already public.

`GET /admin/offerings/[id]/reference` provides reference pricing for a given
offering; surface it in the editor as guidance, not as a constraint.

> **Correction (found live):** no admin tier route exists at all — no
> add/edit/remove for an offering's quantity tiers on the admin side,
> confirmed by file listing (`admin/companies/[id]/offerings/[offeringId]/`
> has no `tiers/` subdirectory). Tiers stay provider-only,
> change-request-gated (phases 7/9); the admin editor reuses `TierRow` in
> read-only display only (its `onDelete` prop was made optional for this —
> additive, the provider editor still always passes it).

---

## APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET · POST | `/admin/companies` | List · create |
| PUT · DELETE | `/admin/companies/[id]` | Full update · delete |
| PATCH | `/admin/companies/[id]/status` | Activate / suspend |
| GET | `/admin/companies/[id]/availability` | Availability state |
| GET · POST | `/admin/companies/[id]/busy-windows` | List · create |
| DELETE | `/admin/companies/[id]/busy-windows/[windowId]` | Remove |
| GET · POST | `/admin/companies/[id]/offerings` | List · create directly |
| PATCH · DELETE | `/admin/companies/[id]/offerings/[offeringId]` | Edit · delete |
| PATCH | `/admin/companies/[id]/offerings/[offeringId]/visibility` | Active / sort |
| POST | `/admin/companies/[id]/projects` | Add on their behalf |
| DELETE | `/admin/projects/[id]` | Remove |
| POST | `/admin/companies/[id]/reviews` | Add a review |
| DELETE | `/admin/companies/[id]/reviews/[reviewId]` | Remove |
| GET | `/admin/companies/[id]/waitlist` | Company waitlist |
| DELETE | `/admin/companies/[id]/waitlist/[entryId]` | Remove entry |
| GET | `/admin/waitlist` | Platform-wide waitlist |
| GET · POST | `/admin/categories` | List · create |
| PUT · DELETE | `/admin/categories/[id]` | Update · delete |
| GET | `/admin/offerings/[id]/reference` | Reference pricing |
| POST | `/admin/upload` | Image upload |

All `adminOnly`.

> `PUT`, not `PATCH`, on `/admin/companies/[id]` and `/admin/categories/[id]` —
> send the full representation. Sending a partial body will blank fields.

---

## Components

Reuse phase 7's `PricingModelPicker`, `PriceFields`, `TierEditor`,
`OfferingRow`; phase 6's `AvailabilityToggle`, `BusyWindowRow`, `ImageUploader`,
`ProjectCard`; phase 3's `StatusPill`.

New: `CompanySectionNav`, `CompanyForm`, `CategoryRow`, `CategoryForm`,
`PricingModeSelector`, `GalleryManager`.

## State

`companiesStore`, per-company detail store keyed by id, `categoriesStore`.
Focus refetch; invalidate the detail store after any write.

---

## Tasks

| # | Task |
|---|------|
| 10.1 | `lib/adminCompanies.ts` and `lib/adminCategories.ts`. |
| 10.2 | Company detail shell with section navigation and per-section deep links. |
| 10.3 | Company profile form — **full-representation PUT**, prefilled from the current record. |
| 10.4 | Create-company flow. |
| 10.5 | Status change with a confirm that names the public consequence. |
| 10.6 | Availability + busy windows, reusing phase 6's components. |
| 10.7 | Admin offerings list and editor reusing phase 7's form, with direct-write labelling. |
| 10.8 | Reference-pricing hint in the offering editor. |
| 10.9 | Projects and reviews sections. |
| 10.10 | Company waitlist (read) and the platform-wide waitlist screen. |
| 10.11 | Categories list, editor and `PricingModeSelector` with an explanatory confirm. |
| 10.12 | Gallery manager with multi-image upload and reorder. |
| 10.13 | Tests + device pass. |

## Tests

Unit: full-representation PUT builder (no field silently dropped);
`PricingModeSelector` copy per mode; gallery reorder.

Integration: a partial PUT is rejected or round-trips without data loss — assert
whichever the API actually does, and encode it; suspending a company removes it
from public listings; deleting a category with companies attached behaves as the
API defines (**confirm this before building the confirm dialog**).

## Definition of done

- [ ] An admin creates, edits, suspends and deletes a company.
- [ ] An admin manages a company's offerings, tiers, projects, reviews,
      availability and waitlist.
- [ ] An admin manages the category tree including pricing mode.
- [ ] No edit silently blanks a field.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **`PUT` semantics blanking fields** | This turned out to be a real bug, not just a risk to design around — see the correction below. Fixed at the schema level; the mobile editor's own defensive habit (always send the full record) was correct all along and needed no change. |
| Changing a category's pricing mode | Changes the public request flow for every company in it. Explain the consequence in the confirm. |
| Deleting a company or category with dependents | Confirm the API's cascade behaviour before writing the dialog — do not guess. |
| Admin catalog edits bypassing review | Correct, but surprising. Label the editor so an admin knows their change is already live. |
| Large galleries on a phone | Paginate or lazy-load; `expo-image` throughout. |

### Correction (found live, and fixed): partial `PUT` really did blank fields — but only some

This phase's own test task ("a partial PUT is rejected or round-trips
without data loss — assert whichever the API actually does") turned up a
real, previously-unfixed bug, confirmed against the live local API and DB
before anything in the mobile editor was built to route around it.

**What actually happens.** `companiesService.update()`/`categoriesService.
update()` correctly treat an `undefined` field as "leave this column
alone" (`input.x ?? undefined`). That part works. The break is one layer
up: `updateCompanySchema`/`updateCategorySchema` were `baseSchema.
partial()`, and `.partial()` does **not** stop Zod from applying a field's
own `.default(...)` when that field is omitted from the input — so a body
like `{ tagline: "x" }` doesn't parse to `{ tagline: "x" }`, it parses to
`{ tagline: "x", gallery: [], services: [], badges: [], featured: true,
verified: false, completedProjects: 0 }` (companies) or `{ ..., description:
"", isActive: true, pricingMode: "QUOTE_ONLY" }` (categories) — every
defaulted field the caller never touched, now present and no longer
`undefined`, which the service layer then dutifully writes.

This was **already flagged** elsewhere in the codebase — `offerings.ts`'s
own comment on why `tags` is `.nullish()` instead of `.default([])`
explicitly names this exact hazard for `companies.ts`'s services/gallery/
badges, and `changeRequests.service.ts`'s `validateChangeValues()` already
works around it for the provider change-request path by rebuilding the
parsed object from only the input's own keys. Neither fix had been applied
to the admin **direct** company/category PUT path — which phase 10 is the
first phase to actually build a caller for.

**How it was found.** Testing this phase's own explicit test requirement
against the real API: a `PUT /admin/companies/[id]` with only `{ tagline }`
against a real seeded company reset its 6-image gallery to `[]`, `verified`
to `false`, and `completedProjects` to `0`. All three were recovered from
`app/src/lib/data.ts`'s seed source (the company's original definition) and
confirmed restored via the public profile endpoint.

**The fix.** `updateCompanySchema` and `updateCategorySchema`
(`validation/companies.ts`, `validation/categories.ts`) now `.extend()` the
specific defaulted fields with no-default versions after `.partial()`, so
omitting them truly parses to `undefined`. Regression-tested in
`api/tests/integration/adminCompanyPartialPut.int.test.ts`: a partial PUT
to each route now leaves every other field untouched.

**What this changes for the mobile editor.** Nothing — `CompanyForm`/
`CategoryForm` were already built to always send the complete
representation (`companyToInput`/`categoryToInput`, built from the
freshly-fetched record), per this phase's own risk note, before the bug
above was even found. The fix closes the hole for every OTHER caller
(present or future — a different app version, the desktop Control Center,
a script) that might someday send a genuinely partial body, not just this
one.
