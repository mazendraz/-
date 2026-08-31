# Phase 7 — Provider: catalog & pricing

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 6 (shares the change-request pattern) · **Unblocks:** nothing
**Backend change:** none · **Roles:** PROVIDER

---

## Objective

A provider manages their own price list from the phone: offerings, quantity
tiers, and package discounts.

This was deliberately deferred out of the MVP — it is a large form surface with no
on-site urgency. It is included here because the goal is the **complete** provider
surface, and pricing is the one remaining thing a provider currently has to open a
laptop for.

## Scope

**In:** offerings CRUD, tiers, publish requests, visibility/sort, bundle rules.

**Out:** admin-side catalog editing (phase 10), category pricing modes
(admin-owned), the reference-price lookup (`/admin/offerings/[id]/reference`, admin only).

---

## The domain, from the code

An **offering** (`ApiOffering`) is a priced service or product. Prices are whole
Egyptian pounds — no piastres, no currency field.

| Field | Meaning |
|-------|---------|
| `kind` | `SERVICE` \| `PRODUCT` |
| `pricingModel` | `FIXED` \| `RANGE` \| `PER_UNIT` \| `ON_INSPECTION` |
| `priceMin` / `priceMax` | bounds; semantics depend on `pricingModel` |
| `unit` | `ApiPriceUnit`, only meaningful for `PER_UNIT` |
| `minQty`, `sortOrder`, `image`, `note` | presentation |
| `nameAr` / `descriptionAr` | optional Arabic companions; `name`/`description` stay canonical |
| `tags` | search-only keywords, no display surface |
| `isActive` | provider-controlled visibility |
| `isPublished` | **admin-controlled** — set by approving a publish request |
| `priceUpdatedAt` | drives "prices updated N days ago" |
| `tiers` | `ApiOfferingTier[]` — quantity bands |

A **tier** overrides the offering's price for the line it matches, so a band added
to an already-published offering is a **new public price** and carries its own
`isPublished` flag pending review.

A **bundle rule** (`ApiBundleRule`) is a package discount applied once a request
reaches `minItems` items.

### The two-gate model — get this right or the screen lies

| Gate | Owner | Route |
|------|-------|-------|
| `isPublished` | **admin**, via an approved `ChangeRequest{PUBLISH}` | `POST /provider/offerings/[id]/publish` files the request |
| `isActive` + `sortOrder` | **provider**, applied immediately | `PATCH /provider/offerings/[id]/visibility` |

`POST /provider/offerings` **always creates a draft** (`isPublished = false`).
`DELETE /provider/offerings/[id]` removes a draft immediately; a published
offering follows the change-request path.

Only rows with `isPublished && isActive` appear on a public profile. The UI must
show both states separately — "live", "hidden by you", "awaiting review",
"draft" — because a provider who cannot tell them apart will file duplicate
publish requests.

---

## Screens

| Screen | Purpose |
|--------|---------|
| `offerings` | List with per-row state chips (live / hidden / pending / draft), search, reorder, quick active toggle |
| `offerings/[id]` | Edit form: name, Arabic name, description, kind, pricing model with model-dependent fields, unit, min qty, image, note |
| `offerings/[id]/tiers` | Quantity bands: label, `qtyMin`/`qtyMax`, `priceMin`/`priceMax`, sort; per-tier publish state |
| `bundle-rules` | Package discounts: label, `minItems`, `discountPercent`, active |

---

## APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/provider/offerings` | Everything this company owns, **drafts included** |
| POST | `/provider/offerings` | Always creates a draft |
| PATCH | `/provider/offerings/[id]` | Edit |
| DELETE | `/provider/offerings/[id]` | Draft goes immediately; published goes via change request |
| POST | `/provider/offerings/[id]/tiers` | Add a band |
| PATCH · DELETE | `/provider/offerings/[id]/tiers/[tierId]` | Edit · remove a band |
| POST | `/provider/offerings/[id]/publish` | Files a `ChangeRequest{PUBLISH}` |
| PATCH | `/provider/offerings/[id]/visibility` | `isActive` / `sortOrder`, applied immediately |
| GET · POST | `/provider/bundle-rules` | list · create |

All `providerOnly`.

---

## Components

`OfferingRow`, `PublishStateChip`, `PricingModelPicker`, `PriceFields`
(model-dependent), `UnitPicker`, `TierRow`, `TierEditor`, `BundleRuleRow`,
`ReorderHandle`.

`PriceFields` is the one with real logic: `FIXED` shows one price, `RANGE` shows
min and max with min ≤ max validation, `PER_UNIT` shows a price plus a unit and
min quantity, `ON_INSPECTION` shows **no price fields at all** and explains that
the price is quoted on site.

## State

`offeringsStore` (list + drafts), per-offering edit state, `bundleRulesStore`.
Not realtime — focus refetch.

---

## Tasks

| # | Task |
|---|------|
| 7.1 | `lib/offerings.ts` and `lib/bundleRules.ts` with typed callers. |
| 7.2 | Offerings list with the four-state chip and search. |
| 7.3 | Reorder (drag or up/down) writing `sortOrder` through the visibility route. |
| 7.4 | Quick `isActive` toggle with optimistic state and rollback. |
| 7.5 | Offering editor with `PricingModelPicker` driving which price fields render. |
| 7.6 | Client-side validation: min ≤ max; unit required for `PER_UNIT`; no price for `ON_INSPECTION`. |
| 7.7 | Image upload through `provider/upload`; `expo-image` for display. |
| 7.8 | Tier editor with band-overlap validation. |
| 7.9 | Publish action that files a change request and shows the pending state. |
| 7.10 | Bundle rules screen. |
| 7.11 | Tests + device pass on the form surface. |

## Tests

Unit: `PriceFields` renders the right fields per model; min/max validation; tier
band overlap; discount percent bounds; "prices updated N days ago" from
`priceUpdatedAt`.

Integration: `POST /provider/offerings` returns `isPublished: false`; deleting a
published offering does not remove it immediately; another company's offering id
returns 403.

## Definition of done

- [ ] A provider creates, edits, prices, tiers, orders, hides and publishes an
      offering without opening the web dashboard.
- [ ] The four states are visually distinct and correctly labelled.
- [ ] `ON_INSPECTION` never shows a price field.
- [ ] Bundle rules are manageable end to end.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Confusing `isPublished` with `isActive`** | The single most likely bug in this phase. One is admin-owned and asynchronous; the other is provider-owned and immediate. Label them in the provider's words — "أمام العملاء" vs "في انتظار المراجعة" — never as raw flags. |
| A tier silently becoming a new public price | Show the per-tier publish state on the row, not only on the offering. |
| Long forms on a small screen under RTL | Section the editor; keep a sticky save bar (the web dashboard already uses this pattern). |
| Duplicate publish requests | Disable the publish action while one is pending and say why. |
| Whole-pound prices | No decimal input. Reject piastres at the field, not at the server. |
