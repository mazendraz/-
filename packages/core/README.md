# `@alassema/core`

The contract, in one place: what the API returns, and the pure helpers every
client needs to make sense of it.

## Why this package exists

Before it, `ApiLead` was declared in **three** places — `api/src/lib/apiTypes.ts`,
`app/src/lib/apiTypes.ts`, and again as `Lead` inside `app/src/lib/requests.ts`.
They had already drifted: the API's copy carried `reviewed`, `items`,
`estimatedMin/Max`, `discountPercent`, `hasOnInspection` and `completion`; the
app's copy carried none of them.

Nothing enforced agreement, so nothing kept them in agreement. With two mobile
apps about to become a third and fourth consumer of the same contract, "keep
them in sync by remembering to" stops being a strategy.

## Ships TypeScript source, not a build

`main` and `types` both point at `src/index.ts`. There is no compile step, no
`dist/`, and no build to run before the app starts.

That is deliberate: every consumer already has a bundler that reads TypeScript
(Vite today, Metro for the Expo apps), and a build step here would mean a stale
`dist/` is possible — which is the same class of problem this package was
created to remove.

## What belongs here

Anything true for **every** client:

* the API's request/response shapes,
* pure functions over them — phone normalization, price formatting, plurals.

What does **not** belong: anything touching `window`, `localStorage`, React, or
Node built-ins. The moment this package imports one of those it stops being
usable from one of the four consumers, and which one breaks depends on which
import someone reached for.

## What's here now, and what deliberately isn't yet

**Here: the contract.** `apiTypes.ts` — 90 declarations, zero imports, zero
runtime values. Both packages re-export it from their existing
`lib/apiTypes.ts`, so not one import site across either codebase had to change.

That the re-export is `export type *` and not `export *` is what made this safe:
everything in the file is a type, so the statement is erased at compile time.
Neither Vite nor Next ever resolves a path outside its own package, and no
bundler config was needed anywhere.

**Not here yet: the pure helpers** (`phone`, `pricing`, `format`, `plural`).

They are the obvious next residents and they are genuinely portable. But they
are RUNTIME modules, so moving them means Vite must resolve `@alassema/core` for
real — a workspace install that restructures `node_modules` for a live app —
and the payoff is zero until a second runtime consumer exists. The check that
would actually matter, *does this resolve under Metro*, cannot be run until the
Expo app is created.

So they move in phase 3, alongside the app that validates the move. The `npm`
workspace is already declared at the root, which is what phase 3 needs; nothing
resolves through it yet.

## What this extraction found

Each fix surfaced the next duplicate. `ApiOffering` turned out to exist in
**four** places — `api/src/lib/apiTypes.ts`, `app/src/lib/apiTypes.ts`,
`api/src/lib/services/offerings.service.ts`, and now here — with real
disagreements between them:

| | Was | Now |
| --- | --- | --- |
| `ApiLead` | API had `reviewed`, `items`, `estimatedMin/Max`, `discountPercent`, `hasOnInspection`, `completion`; the frontend's copy had none, so `requests.ts` declared a third version to fill the gap | one definition |
| `ApiOfferingTier.isPublished` | only in the frontend's copy — the serializer had always emitted it | in the contract |
| `ApiCategory.publishedOfferingCompanyCount` | only in the frontend's copy | in the contract |
| `ApiOffering.unit` | `string` in two copies, `ApiPriceUnit` in one — the value comes from a Prisma enum | `ApiPriceUnit` everywhere |
| `ApiOfferingKind` · `ApiPricingModel` · `ApiPriceUnit` | named in the frontend, written out inline at three API call sites | named, used in all four |

None of that was found by reading. The compiler found all of it, the moment one
definition became authoritative.

## A note on the workspace

The root `package.json` declares `workspaces: ["api", "app", "packages/*"]`, but
**no root install has been run** and there is no root lockfile. `api/` and
`app/` still install independently via `npm run install:all`, exactly as before.

The declaration is there because phase 3 needs it — the Expo apps join as
workspace members — and because it costs nothing while unused. Be aware that a
plain `npm install` at the repository root now behaves differently than it used
to: it would hoist dependencies and restructure `node_modules` for both existing
packages. Use `npm run install:all` until phase 3 does that deliberately.
