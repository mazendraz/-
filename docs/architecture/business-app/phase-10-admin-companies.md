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

### `admin/companies/new`

Create a company via `POST /admin/companies`.

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
| **`PUT` semantics blanking fields** | The highest-risk bug in this phase, and silent. Always build the body from the freshly-fetched record, never from form state alone. |
| Changing a category's pricing mode | Changes the public request flow for every company in it. Explain the consequence in the confirm. |
| Deleting a company or category with dependents | Confirm the API's cascade behaviour before writing the dialog — do not guess. |
| Admin catalog edits bypassing review | Correct, but surprising. Label the editor so an admin knows their change is already live. |
| Large galleries on a phone | Paginate or lazy-load; `expo-image` throughout. |
