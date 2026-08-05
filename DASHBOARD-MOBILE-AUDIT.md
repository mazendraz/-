# Dashboard Mobile Audit — Admin & Provider

Scope: `/admin` (all 10 tabs) and `/provider` (all 10 tabs) at phone widths.
Companion to [`UI-UX-AUDIT.md`](UI-UX-AUDIT.md), which covered the **public**
site and deliberately left both dashboards mostly out of scope — see
[`CLOSURE-REPORT.md`](CLOSURE-REPORT.md) §2 ("لوحة المزوّد لسه على نفس الـ
pattern القديم — قرار موثّق").

| | |
|---|---|
| **Date** | 2026-08-03 |
| **Method** | Static read of every dashboard file + the shared shell, chart, modal and nav components. Sizes computed from the real type scale in `tailwind.config.js` (`caption` 12/16, `label` 13/18, `body` 15/22, `subhead` 18/26, `title` 22/30) and the real `.field-input` box in `index.css` (14px/16px padding, 16px font). |
| **Not done** | No runtime measurement pass. The existing Playwright matrix cannot produce one — see **DM-01**, which is why that finding is ranked first. Every measurement below is derived from source, so treat the exact pixel figures as ±4px, not as instrument readings. |

---

## 1. Verdict

The dashboards are **usable on a phone, not designed for one**. Nothing is
outright broken, and the shared foundations are genuinely good — one
`DashboardShell` (desktop rail + drawer + hamburger topbar), one `Modal` that
is already a bottom sheet on mobile, one `SidebarNav`, and charts that are
`viewBox`-scaled SVG rather than fixed-width canvases.

The problem is **asymmetry**. Admin got a real mobile pass; provider did not.
The same data — a lead — has a purpose-built `LeadMobileCard` in admin and a
compressed desktop row in provider. Where the two dashboards were unified into
shared components they are fine; where each kept its own copy, only one was
fixed.

| Area | Admin | Provider |
|---|---|---|
| Shell / drawer / topbar | ✅ shared | ✅ shared |
| Routing (Back button) | ✅ nested routes | ❌ `useState` tabs |
| Lead list on mobile | ✅ cards below `lg:` | ❌ desktop rows at all widths |
| Code splitting | ✅ per-tab lazy | ❌ one 1,042-line chunk |
| Touch targets | 🟡 partly fixed (`min-h-[44px]` on company actions) | ❌ untouched |
| Safe-area insets | ❌ none | ❌ none |
| Covered by mobile tests | ❌ login screen only | ❌ login screen only |

**Scores (1–10, phone usability):** Admin **6.5** · Provider **4**.

---

## 2. Findings

18 findings. Severity: 🔴 blocks work on a phone · 🟠 makes a core task
painful · 🟡 visible friction · 🔵 polish.

| # | ID | Finding | Sev |
|---|---|---|---|
| 1 | DM-01 | Mobile test matrix never authenticates — both dashboards are untested at 390px | 🔴 |
| 2 | DM-02 | Provider tabs are `useState`, not routes — Back exits the dashboard | 🟠 |
| 3 | DM-03 | Provider lead list has no mobile card variant | 🟠 |
| 4 | DM-04 | `DashboardShell` has zero safe-area handling | 🟠 |
| 5 | DM-05 | Chat is a stacked master-detail on mobile | 🟠 |
| 6 | DM-06 | Touch targets under 44px on mobile-visible controls | 🟠 |
| 7 | DM-07 | Every tab switch costs two taps through the drawer | 🟠 |
| 8 | DM-08 | Admin company card never stacks at narrow widths | 🟡 |
| 9 | DM-09 | `CompanyEditor` sub-tabs overflow horizontally inside the modal | 🟡 |
| 10 | DM-10 | Unconditional `grid-cols-2` puts selects in ~155px boxes | 🟡 |
| 11 | DM-11 | Bar values and every `title=` tooltip are hover-only | 🟡 |
| 12 | DM-12 | Provider dashboard ships as one chunk | 🟡 |
| 13 | DM-13 | Provider `?tab=` read once — notification deep-link can spawn a 2nd window | 🟡 |
| 14 | DM-14 | Charts distort at narrow widths (`preserveAspectRatio="none"`) | 🟡 |
| 15 | DM-15 | Drawer has no swipe-to-close or edge-swipe-to-open | 🟡 |
| 16 | DM-16 | No refresh affordance on touch | 🟡 |
| 17 | DM-17 | Icon-only sign-out below `sm:` relies on `title` | 🔵 |
| 18 | DM-18 | Settings tab strip ~42px tall | 🔵 |

---

### DM-01 🔴 — The mobile test matrix never logs in ✅ CLOSED 2026-08-03

> **Closed in Phase 0.** The matrix now authenticates and covers 18 real
> dashboard tabs (108 tests where there were 0). Full record, measured
> per-tab counts, and the coverage limits that remain:
> [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 0.
>
> Note the remaining gap: the harness measures each route **as first opened**,
> so anything behind an interaction — DM-09's editor modal, DM-05's chat thread,
> the modal-gated half of DM-06 — is still unverified and needs an
> interaction pass before those findings can be called fixed.

**Where:** [`app/tests/ui-audit.spec.ts:44-51`](app/tests/ui-audit.spec.ts#L44-L51)

**Description.** The suite is excellent and already asserts exactly the four
things this audit is about: no horizontal overflow, no serious/critical axe
violations, **touch targets ≥ 44×44px**, and no text under 12px — across 3
viewports × 2 locales. `/admin` and `/provider` are in the route list. But the
spec's own comment says it: *"No auth session is created for these two —
RequireAuth renders a real, standalone LoginScreen when unauthenticated."*

**Why it is a problem.** Every baseline in `tests/__baseline__/admin-390-*.png`
and `provider-390-*.png` is a **screenshot of a login form**. The harness that
would catch findings DM-03 through DM-18 automatically is pointed at a page
that contains none of them. Worse, it reports green, so the dashboards look
covered.

**Recommended solution.** Seed a session in `addInitScript` the same way the
locale is seeded. The login endpoint already returns the token in the response
body ([`api/src/app/api/auth/login/route.ts:76`](api/src/app/api/auth/login/route.ts#L76)),
and `e2e/admin.spec.ts` already knows how to log in — reuse it via a Playwright
storage state. Then expand the route list to the real tabs
(`/admin/leads`, `/admin/companies`, `/admin/chat`, `/admin/settings`,
`/provider?tab=leads`, …). **Do this first** — it turns the rest of this
document into a red test run you can fix against, instead of a list to
re-verify by hand.

---

### DM-02 🟠 — Provider tabs are state, not routes: Back exits the dashboard ✅ CLOSED 2026-08-04

> Closed in Phase 3, along with DM-12 and DM-13 below (same refactor).
> `ProviderLayout.tsx` + 10 nested routes under `/provider`, mirroring
> `AdminLayout.tsx`. Verified with 3 new tests: Back moves between tabs,
> reload preserves the tab, legacy `?tab=` links still resolve. Full record:
> [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 3.

**Where:** [`app/src/pages/ProviderDashboard.tsx:88-92`](app/src/pages/ProviderDashboard.tsx#L88-L92)

**Description.** `const [tab, setTab] = useState<ProviderTab>(...)` reads
`?tab=` once on mount and never writes back. Admin was converted to real nested
routes under NAV-06 ([`AdminLayout.tsx`](app/src/pages/admin/AdminLayout.tsx));
provider kept the old pattern.

**Why it is a problem.** On desktop this is a minor annoyance. On a phone the
Back gesture is the *primary* navigation control, and in an installed PWA there
is no URL bar to fall back on. A provider who taps Leads → opens a lead →
swipes back does not go back to the tab list; they leave the dashboard
entirely. No provider tab can be bookmarked, shared, or restored after a
refresh — every reload dumps them on Overview.

**Recommended solution.** Mirror the admin conversion: nested routes under
`/provider`, `SidebarNav` in `linkTo` mode instead of `onSelect`, and an index
redirect that preserves `?tab=` for back-compat (`AdminIndexRedirect` is the
template). This also unblocks DM-12 and DM-13, which are both downstream of it.

---

### DM-03 🟠 — Provider lead list has no mobile card variant

**Where:** [`app/src/pages/ProviderDashboard.tsx:760-830`](app/src/pages/ProviderDashboard.tsx#L760-L830) (`LeadRows`)

**Description.** Admin renders leads two ways — a `<table>` gated behind
`hidden lg:block` and a purpose-built `LeadMobileCard` below it
([`tabs/LeadsPage.tsx`](app/src/pages/admin/tabs/LeadsPage.tsx)). Provider has
one layout at every width: `flex items-start gap-4 px-5 py-4 flex-wrap`, with
a `flex-shrink-0` right column holding a status `<select>` and a date.

**Why it is a problem.** At 390px: 40px of horizontal padding + 16px gap + a
~110px non-shrinking control column leaves roughly **224px** for the reference
number, status pill, name, phone, service, district, budget and a 2-line
description. Everything wraps into a tall ragged block. This is the provider's
single most-used screen — the one they check on a phone between site visits —
and it is the least adapted screen in the product.

**Recommended solution.** `LeadMobileCard` is already exported from
[`admin/LeadsTab.tsx`](app/src/pages/admin/LeadsTab.tsx) and takes the same
`LeadListRow` union the provider already builds. Import it, apply the same
`hidden lg:block` / `lg:hidden` split, and route the card's tap to a detail
modal (`LeadModal` is exported too). This is the highest value-per-hour fix in
this document: it is mostly deletion.

> Note: `LeadListRow` is currently declared **twice** — once in
> `admin/LeadsTab.tsx:34` and again in `ProviderDashboard.tsx:66` — with
> identical shapes. Collapse to the shared one while you are here.

---

### DM-04 🟠 — `DashboardShell` has zero safe-area handling

**Where:** [`app/src/components/DashboardShell.tsx:64-77`](app/src/components/DashboardShell.tsx#L64-L77)

**Description.** The public site handles notches properly — `viewport-fit=cover`
in `index.html`, `env(safe-area-inset-*)` on the bottom nav, the company-profile
CTA bar and the search overlay. The dashboards use **none** of it. A repo-wide
grep for `safe-area` returns six hits, all on public-site surfaces.

**Why it is a problem.** Three concrete collisions once the app is installed
standalone (which is the stated direction):

1. The sticky topbar sits at `top-0` with `py-3` — the hamburger and page title
   render **under the status bar / notch** on any modern iPhone.
2. The drawer is `h-full` with a "Back to site" link in its bottom padding —
   that link lands **under the home indicator**.
3. `SettingsTab`'s sticky save bar is `sticky bottom-0`
   ([`SettingsTab.tsx:210`](app/src/pages/admin/SettingsTab.tsx#L210)) with no
   bottom inset — the **Save button** is the thing under the home indicator.

**Recommended solution.** Add insets in the shell so every tab inherits them:
`pt-[max(0.75rem,env(safe-area-inset-top))]` on the topbar,
`pb-[env(safe-area-inset-bottom)]` on the drawer's footer and on the main
content wrapper. `index.css` already defines a `bottom-nav-safe` helper — add a
`dashboard-safe` sibling rather than scattering `env()` through JSX.

---

### DM-05 🟠 — Chat is a stacked master-detail on mobile ✅ CLOSED 2026-08-04

> Closed in Phase 4: below `lg:` (admin) / `md:` (provider), the list and
> thread are never both on screen — the selected conversation is `?c=<id>`
> in the URL, with an in-UI back button and working browser Back. Verified
> with 6 tests (opening fills the screen, in-UI back closes it, browser Back
> closes it, desktop keeps both columns — admin and provider each).
> [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 4.

**Where:** [`app/src/pages/admin/ChatTab.tsx:120`](app/src/pages/admin/ChatTab.tsx#L120) · [`app/src/components/ProviderChat.tsx:78`](app/src/components/ProviderChat.tsx#L78)

**Description.** Both use a two-column grid that collapses to one column:
`grid-cols-1 lg:grid-cols-[20rem_1fr]` (admin) and
`grid-cols-1 md:grid-cols-[18rem_1fr]` (provider). Below the breakpoint the
conversation list renders **above** the thread, in its own
`max-h-[32rem] overflow-y-auto` box, with the thread's `h-[26rem]` pane
underneath.

**Why it is a problem.** To read a reply on a phone you scroll past a 512px
scrollable list to reach a 416px thread, then scroll back up to switch
conversations — two nested scroll regions stacked vertically, which is the
classic broken-master-detail pattern. Chat is the one real-time surface in the
product and the most likely reason either role opens the app on a phone at all.

**Recommended solution.** Push-navigation below `lg:`: show the list only when
nothing is selected, and swap to a full-height thread with a back button when a
conversation is active (`active ? <Thread/> : <List/>`). Both files already
track `active` state, so this is a render-branch, not a refactor. Once DM-02
lands, make the selection a route param so Back closes the thread — the gesture
users will try first.

---

### DM-06 🟠 — Touch targets under 44px on mobile-visible controls

**Description.** The public site was swept for this under A11Y-11; the
dashboards were not. Sizes below are computed from the type scale and the
literal padding classes.

> **Measured 2026-08-03**, once the Phase-0 harness could reach the dashboards.
> Figures below are now real `getBoundingClientRect()` values at 390px, not the
> static estimates this section originally carried — several were off, and the
> list was incomplete. Corrections noted inline.

| Control | Where | Measured @390px | Target |
|---|---|---|---|
| Lead status `<select>` | `ProviderDashboard.tsx` `LeadRows` — `px-2.5 py-1 text-caption` | **100 × 35** (est. said 26 — the UA's own select min-height lifts it) | 44 |
| Waitlist delete button | same, `p-1.5` | **36 × 42** | 44 |
| Lead filter chips ×7 | same, `px-3.5 py-1.5 rounded-full` | **32px tall** (missed in the static pass) | 44 |
| Search input | `SearchInput` — `py-2.5` | **358 × 40** | 44 |
| Topbar hamburger | `DashboardShell.tsx:70` — `p-1.5` | **36 × 42** | 44 |
| Topbar logo link | `DashboardShell.tsx:76` | **36 × 36** | 44 |
| Sign-out button | `AdminLayout.tsx:60` / `ProviderDashboard.tsx:283` | **48 × 40** | 44 |
| Chat close/reopen | [`ChatTab.tsx:165`](app/src/pages/admin/ChatTab.tsx#L165) — `px-3 py-1.5 text-caption` | ≈ 28 *(static est.)* | 44 |
| Message hide/unhide | [`ChatThread.tsx:241`](app/src/components/ChatThread.tsx#L241) — bare `text-caption` button | ≈ 16 *(static est.)* | 44 |
| Change-request field checkbox | [`ChangeRequestsTab.tsx:404`](app/src/pages/admin/ChangeRequestsTab.tsx#L404) — `w-4 h-4` | 16 *(static est.)* | 44 |
| Project star / feature toggle | [`CompanyEditor.tsx:382`](app/src/pages/admin/CompanyEditor.tsx#L382) — `p-1.5` | ≈ 38 *(static est.)* | 44 |

**29 distinct undersized elements on `provider-leads` alone** — the static read
had found 6 across both dashboards. The shell-level ones (hamburger, logo,
sign-out, search) appear on *every* dashboard route, so fixing
`DashboardShell` and `SearchInput` clears a large share of the total at once.

### DM-06b 🔴 — 13 unlabelled `<select>` elements (found by the harness, not the audit)

axe reports **`select-name` (critical) × 13** on `provider-leads-390`. Every
lead/waitlist status `<select>` in `LeadRows` is rendered with no accessible
name — no `aria-label`, no associated `<label>`. A screen-reader user hears
thirteen unnamed combo boxes and cannot tell which lead each one belongs to.

This is a **critical** a11y violation and it was **not** in the original static
pass. It is the clearest evidence for DM-01's argument: the harness found in
one run what reading the file did not. Fix alongside DM-06 — the same elements
need both a 44px box and an `aria-label` naming the lead.

**Why it is a problem.** The change-request checkbox is the worst of these:
selective approval (approve 3 of 5 changed fields) is an admin's main lever on
that screen, and it is a 16px hit box. The provider's lead-status select is the
most-used control in the product at 26px. Note that the *right* pattern is
already in the codebase — `Modal`'s close button and `CompanyEditor`'s delete
use `w-11 h-11 -m-2.5` (44px hit box, zero layout cost), and `CompaniesPage`
uses explicit `min-h-[44px]`.

**Recommended solution.** Apply the existing `w-11 h-11 -m-2.5` idiom to the
icon buttons, `min-h-[44px]` to the selects and pill buttons, and wrap the
change-request checkbox in a `min-h-[44px]` label so the whole row is the hit
target. DM-01's harness verifies all of them at once.

---

### DM-07 🟠 — Every tab switch costs two taps ✅ CLOSED 2026-08-04

> Closed in Phase 4: `BottomNav` generalized over an item list (was hardcoded
> to the public site's 4 tabs + a direct `useSaved()` call); admin and
> provider each get their own 4-tab bar with badges reused from the sidebar's
> own counts — no new counters invented. `DashboardShell` grew a `bottomNav?`
> prop and a `.dashboard-has-bottom-nav` CSS hook so `.dashboard-bottom-safe`
> regions (including SettingsTab's save bar) clear the bar's height
> automatically. Verified with 6 tests, including one confirming the bar
> doesn't cover the Save button. [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 4.

**Where:** [`app/src/components/DashboardShell.tsx:47-58`](app/src/components/DashboardShell.tsx#L47-L58)

**Description.** Below `md:` the only way to change tab is: tap hamburger →
drawer animates in → tap tab → drawer closes. Admin has 10 tabs, provider has
10. There is no bottom bar, no horizontal tab strip, no quick switcher.

**Why it is a problem.** The public site gives customers a native-feeling
4-tab bottom bar ([`BottomNav.tsx`](app/src/components/BottomNav.tsx)); the
people who use the product *all day* get a hamburger. Provider workflow is
inherently tab-hopping — Leads → Messages → Availability → Leads — so a
3-lead triage session costs a dozen extra taps and 6 drawer animations.

**Recommended solution.** Give the dashboards their own bottom bar below `md:`
with the 4 tabs each role actually lives in (provider: Overview · Leads ·
Messages · Availability; admin: Overview · Leads · Chat · Changes), carrying
the same unread/pending badges the sidebar already computes. Keep the drawer
for the remaining six. `BottomNav` is a near-copy — generalise it over an item
list rather than forking it a third time.

---

### DM-08 🟡 — Admin company card never stacks ✅ CLOSED 2026-08-05

> Closed in Phase 5: `flex-col sm:flex-row` on the card, `flex-row flex-wrap
> sm:flex-col` on the action stack, `flex-wrap` on the stats line.
> [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 5.

**Where:** [`app/src/pages/admin/tabs/CompaniesPage.tsx:113`](app/src/pages/admin/tabs/CompaniesPage.tsx#L113)

**Description.** `flex items-center gap-4` with no responsive variant: a 56px
logo, a flexible text block, and a `flex-shrink-0` **vertical stack of four
44px action buttons** (Edit / Busy / View / Login).

**Why it is a problem.** At 390px the card's inner width is ~326px. Logo 56 +
two 16px gaps + a ~110px action column leaves roughly **128px** for the company
name, category label, and the stats line
`★ 4.8 · 12 مشروع · 30 عميل محتمل` — which cannot fit and will either truncate
to uselessness or wrap to four lines. The action column is also ~190px tall,
so every card is at least that tall regardless of content.

**Recommended solution.** `flex-col sm:flex-row` on the card, and move the
actions to a horizontal row beneath the text on mobile (`flex-row sm:flex-col`
on the button stack). The stats line should drop to `flex-wrap`.

---

### DM-09 🟡 — `CompanyEditor` sub-tabs overflow horizontally

**Where:** [`app/src/pages/admin/CompanyEditor.tsx:132`](app/src/pages/admin/CompanyEditor.tsx#L132)

**Description.** The `Tabs` component renders a bare
`<div role="tablist" className={className}>`
([`Tabs.tsx:50`](app/src/components/Tabs.tsx#L50)) — it applies no layout of
its own. `CompanyEditor` passes `flex gap-1 border-b … px-1`: **no
`overflow-x-auto`, no `flex-wrap`**. Up to four tabs render at
`px-4 py-2.5 text-label`.

**Why it is a problem.** Four Arabic labels (التفاصيل / المشاريع / الإتاحة /
الأسعار) at ~87px each plus gaps ≈ **360px**, inside a modal whose content box
at 390px is ~318px. That is a horizontal overflow *inside a modal* — the
hardest kind to notice and the most annoying to use. `SettingsTab`'s equivalent
strip got `overflow-x-auto` ([`SettingsTab.tsx:187`](app/src/pages/admin/SettingsTab.tsx#L187));
this one did not.

**Recommended solution.** Add `max-w-full overflow-x-auto scrollbar-hide` to
the `className` and `whitespace-nowrap flex-shrink-0` to `tabClassName` — the
exact pattern `PersonalTabs.tsx:30` already uses. Better: fold that into `Tabs`
itself so the next caller inherits it.

---

### DM-10 🟡 — Unconditional `grid-cols-2` around `.field-input` selects

**Where:** [`AdminOfferingsPanel.tsx:256`](app/src/pages/admin/AdminOfferingsPanel.tsx#L256) and `:279` · [`ReviewsTab.tsx:270`](app/src/pages/admin/ReviewsTab.tsx#L270) · [`LeadsTab.tsx:161`](app/src/pages/admin/LeadsTab.tsx#L161) and `:210`

**Description.** Five sites use `grid grid-cols-2` with no `sm:`/`md:` prefix.
The rest of the admin codebase correctly uses `grid-cols-1 sm:grid-cols-2`
(e.g. `TeamTab.tsx:238`, `ChangeRequestsTab.tsx:419`).

**Why it is a problem.** Worst case is `AdminOfferingsPanel`, which puts two
`<select class="field-input">` side by side. In a `max-w-md` modal at 390px each
cell is ~155px, and `.field-input` spends `16px + 44px` of that on padding and
the chevron — leaving **~95px** for option text like «على المعاينة» or
«سعر لكل وحدة». The `LeadsTab` / `ReviewsTab` cases are read-only `InfoField`
pairs, so they are cramped rather than broken.

**Recommended solution.** `grid-cols-1 sm:grid-cols-2` at all five sites.
Trivial, but it is a real clipped-text bug on the offerings editor.

---

### DM-11 🟡 — Bar values and `title=` tooltips are hover-only ✅ CLOSED 2026-08-05

> Closed in Phase 5: `BarChart` values visible unconditionally below `md:`.
> The three `title=`-only cases carrying genuinely unique info (busy-until
> date, locked-delete reason, admin-set attribution) got visible text or an
> `aria-label`; the verified-review badge kept its short visible label with
> the fuller explanation moved to `aria-label` rather than inlined on every
> card. [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 5.

**Where:** [`app/src/components/Charts.tsx:206`](app/src/components/Charts.tsx#L206)

**Description.** `BarChart` renders each bar's numeric value as
`opacity-0 group-hover:opacity-100`. The value is also duplicated into a
`title=` attribute. Both are hover affordances.

**Why it is a problem.** Touch devices have no hover state, so on a phone the
monthly-leads bar chart shows **shape only, no numbers** — the value is
unreadable by any gesture. The same applies to the ~20 `title=` tooltips across
the dashboards (busy-until dates on company cards, the verified-review
explainer, availability hints): they are silently absent on touch. The public
site already has this documented as a finding class in
`UI-UX-AUDIT.md` §A11Y ("only discoverable by hover — it has no keyboard or
touch equivalent").

**Recommended solution.** For `BarChart`, show values unconditionally below
`md:` (or on tap-to-select). For `title=` tooltips carrying information that is
not available anywhere else, promote to visible text or a tappable
disclosure — `title` should only ever be a redundant nicety.

---

### DM-12 🟡 — Provider dashboard ships as one chunk ✅ CLOSED 2026-08-04 (see DM-02)

**Where:** [`app/src/pages/ProviderDashboard.tsx`](app/src/pages/ProviderDashboard.tsx) (1,042 lines)

**Description.** Admin's 10 tabs are 10 lazy-loaded nested routes
(`main.tsx` + `AdminLayout`'s own `<Suspense>`). Provider is a single component
holding all 10 tab bodies, statically importing `Charts`, `OfferingsEditor`,
`ProfileEditor`, `ProviderChat`, `WaitlistManager`, `BusyWindowsEditor`,
`AvailabilityControl`, `TelegramConnect` and the whole analytics library.

**Why it is a problem.** A provider opening their dashboard on 3G downloads
the charting code, the offerings editor and the chat client before they can see
their lead count. Lighthouse mobile performance is already 56 on the public
site (`CLOSURE-REPORT.md` §3); this path is heavier.

**Recommended solution.** Falls out of DM-02 almost for free — once the tabs
are routes, each becomes its own `lazy()` chunk with the same `<Suspense>`
fallback admin uses.

---

### DM-13 🟡 — Provider `?tab=` is read once; notification click can spawn a 2nd window ✅ CLOSED 2026-08-04 (see DM-02)

**Where:** [`ProviderDashboard.tsx:88`](app/src/pages/ProviderDashboard.tsx#L88) · [`app/public/sw.js:40-52`](app/public/sw.js#L40-L52)

**Description.** The service worker's `notificationclick` handler focuses an
existing window only when `client.url.includes(target)`. Chat pushes target
`/provider?tab=messages`. A provider already sitting on
`/provider?tab=overview` fails that check, so the SW calls `openWindow` — and
even if it matched, `tab` is `useState`-initialised and would not move.

**Why it is a problem.** Tapping a "new message" notification while the app is
already open either does nothing visible or opens a duplicate instance. In an
installed PWA a second window is especially disorienting.

**Recommended solution.** After DM-02 the tab is a real route, so add a
`navigate()` on `focus()` via `postMessage` from the SW, and relax the
`includes()` match to compare pathname only.

---

### DM-14 🟡 — Charts distort at narrow widths ✅ CLOSED 2026-08-05

> Closed in Phase 5, but **not** via the `preserveAspectRatio="xMidYMid meet"`
> switch this section originally suggested — measured first, and `meet` would
> have letterboxed the chart vertically on exactly the mobile widths this
> project cares about most (viewBox is 2.7:1; a 390px card is ~1.6:1). Fixed
> the actual defect (non-uniform scale distorting stroke width) with
> `vector-effect="non-scaling-stroke"` instead, which keeps the full-bleed
> responsive fill intact. `BarChart` month labels: every other one below `sm:`.
> [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 5 for the full
> reasoning and the one residual (the hover-marker circle, desktop-only,
> minor).

**Where:** [`Charts.tsx:79`](app/src/components/Charts.tsx#L79) and `:133`

**Description.** `AreaLineChart` and its sibling use
`preserveAspectRatio="none"` with a fixed pixel `height` and a `w-full` SVG.

**Why it is a problem.** The viewBox is stretched independently on each axis,
so the same 14-day trend renders with visibly different stroke weight and slope
on a 390px phone than on a 1366px desktop — line caps and joins skew. Combined
with `BarChart`'s `truncate` on equal-width flex labels, six month names get
~50px each at 390px and truncate to two characters.

**Recommended solution.** Use `preserveAspectRatio="xMidYMid meet"` (or drop
the attribute) and set the viewBox aspect from the container. For bar labels,
show every other label below `sm:`, or rotate them.

---

### DM-15 🟡 — Drawer has no swipe gestures ✅ CLOSED 2026-08-05

> Closed in Phase 5: live-follow swipe-to-close with a spring-back under a
> 30% threshold, RTL-aware (closes leftward in English, rightward in
> Arabic — matching the drawer's own attach edge). No drag handle, per
> CMP-09. Verified with 2 tests, including confirming a regression in the
> close-threshold logic is actually caught. [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 5.

**Where:** [`DashboardShell.tsx:47`](app/src/components/DashboardShell.tsx#L47)

**Description.** The drawer opens only from the hamburger and closes only via
the × or a backdrop tap. `useDialogA11y` provides Escape and focus trapping —
both keyboard concerns.

**Why it is a problem.** Swipe-from-edge to open and swipe-to-close are the
expected gestures for a left drawer on both platforms; their absence is a large
part of why the dashboards feel like a website in a window. `Modal` already
accepts `onTouchStart`/`onTouchEnd` for exactly this reason (the gallery
lightbox swipes), so the codebase has the primitive.

**Recommended solution.** Add touch handlers to the drawer panel — translate on
drag, dismiss past a threshold. Deliberately **not** a drag handle bar without
drag behaviour; `Modal.tsx:93` documents why (CMP-09).

---

### DM-16 🟡 — No refresh affordance on touch ✅ CLOSED 2026-08-05

> Closed in Phase 5 with the "minimum, reliable" option this section
> described: a topbar refresh button on both dashboards
> (`DashboardRefreshButton.tsx`) that remounts the current tab, re-running
> every effect it fires on load — a real refetch, not a decorative spin.
> Pull-to-refresh (the "better" option) was not built — out of scope for
> this pass. [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 5.

**Description.** Dashboard data refreshes on mount and after mutations. There
is no pull-to-refresh and no visible refresh button anywhere in either
dashboard.

**Why it is a problem.** On the web, ⌘R is always available. In an installed
standalone PWA there is no reload control at all — a provider whose lead list
went stale while the phone was locked has no way to update it short of killing
the app. This becomes a hard blocker the moment you ship as an app.

**Recommended solution.** A refresh action in the topbar (`topbarActions`
already exists as a slot) is the cheap, reliable version. Pull-to-refresh on
the list tabs is the native-feeling one; note it needs an `overscroll-behavior`
guard so it does not fight the browser's own gesture.

---

### DM-17 🔵 — Icon-only sign-out below `sm:`

**Where:** [`AdminLayout.tsx:60`](app/src/pages/admin/AdminLayout.tsx#L60) · [`ProviderDashboard.tsx:283`](app/src/pages/ProviderDashboard.tsx#L283)

**Description.** `<span className="hidden sm:inline">` hides the label, leaving
a bare `logout` glyph with `title=` and no `aria-label`.

**Why it is a problem.** `title` does not surface on touch (see DM-11), so the
button is unlabelled for both sighted touch users and — since there is no
`aria-label` and the only text node is `hidden` — inconsistently labelled for
screen readers depending on how `hidden sm:inline` computes.

**Recommended solution.** Add `aria-label` alongside `title` on both. Note the
same pattern is used correctly for the Add-company button
(`CompaniesPage.tsx:86`), which is also unlabelled below `sm:` — fix all three.

---

### DM-18 🔵 — Settings tab strip is ~42px tall

**Where:** [`SettingsTab.tsx:190`](app/src/pages/admin/SettingsTab.tsx#L190)

**Description.** `px-3 sm:px-4 py-3 text-label` → 18px line-height + 24px
padding = **42px**, 2px under the 44px minimum. (`SidebarNav`'s items look
similar but are fine — their `text-title` icon carries a 30px line box, giving
54px.)

**Recommended solution.** `py-3.5`, or `min-h-[44px]`.

---

## 3. Suggested order of work

Sequenced so each phase makes the next one cheaper or verifiable.

| Phase | Contents | Why here | Rough effort |
|---|---|---|---|
| **0** | DM-01 | Nothing below is verifiable without it, and it converts the rest into a failing test run | 2–3 h |
| **1** | DM-03, DM-10, DM-09, DM-18, DM-17 | Pure wins, mostly reuse or a prefix; DM-03 is largely deletion | 3–4 h |
| **2** | DM-06, DM-04 | Two systematic sweeps the Phase-0 harness now checks automatically | 3–4 h |
| **3** | DM-02 → then DM-12, DM-13 | The one real refactor; both followers fall out of it nearly free | 5–7 h |
| **4** | DM-05, DM-07 | The two changes that make it *feel* like an app rather than a site | 5–6 h |
| **5** | DM-08, DM-11, DM-14, DM-15, DM-16 | Polish and gesture work | 4–5 h |

Roughly **3–4 focused days** for all 18. Phases 0–2 alone (≈1.5 days) close
every 🟠 that is a pure sizing or reuse problem and take provider from 4 → ~6.5.

## 4. Test coverage to add

Once DM-01 lands, extend `tests/ui-audit.spec.ts`:

- Authenticated routes for all 10 admin tabs and all 10 provider tabs.
- Keep all four existing assertions — they already encode DM-06, DM-09, DM-10
  and DM-18 as failures without any new assertion code.
- Add a nested-scroll assertion for DM-05: no element other than `<html>` should
  have `scrollHeight > clientHeight` while an ancestor also scrolls, at 390px.
- Add a standalone-display run (`display-mode: standalone` emulation) to catch
  DM-04 regressions, since safe-area insets are 0 in a normal browser context
  and will silently pass otherwise.

---

## 5. What is already right

Worth recording so none of it gets "fixed" later:

- **One `DashboardShell`** for both dashboards (CODE-01/02) — drawer width and
  padding can no longer drift apart.
- **`Modal` is already a bottom sheet on mobile** (`items-end sm:items-center`,
  `rounded-t-2xl sm:rounded-2xl`) with a 44px close button, focus trap and
  Escape — no dashboard modal needs mobile work beyond its *contents*.
- **`.field-input` is 16px**, so no admin or provider form triggers iOS
  input-zoom.
- **Admin's leads split** (`hidden lg:block` table + `LeadMobileCard`) is the
  correct pattern, correctly commented (RESP-02) — DM-03 is just extending it.
- **Charts are `viewBox` SVG**, not fixed canvases, so DM-14 is a one-attribute
  fix rather than a rewrite.
- **`SidebarNav` uses logical properties** (`start`/`ms-auto`), so the mobile
  drawer is correct in Arabic RTL — the thing most likely to break in a
  bilingual dashboard.

---

## 6. Findings added after publication

Discovered by the Phase 0–3 test harness reaching content the original static
read couldn't see (loading states, modals, full-parallel timing). Full
narrative for each: [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md).

### DM-06b 🔴 — 13 unlabeled `<select>` elements ✅ CLOSED 2026-08-04
Found during Phase 0's first authenticated run of `provider-leads` — axe
`select-name` critical ×13. Every status `<select>` in `LeadRows` and
`WaitlistManager` now carries `aria-label` naming the lead/entry it belongs
to. See DASHBOARD-MOBILE-AUDIT.md §DM-06 measured table for detail.

### DM-19 🔴 — Settings save bar was never actually sticky ✅ CLOSED (Phase 2)
`DashboardShell`'s `<main>` had `overflow-auto`, but never itself scrolled
(the document did) — which still made it the nearest scrolling ancestor for
every `position: sticky` descendant. `SettingsTab`'s "always reachable" save
bar was pinned to a container that doesn't move, i.e. not sticky since the
comment describing it was written. Fixed by dropping the dead `overflow-auto`.

### DM-20 🟡 — `LField`/`TextField` label association is broken app-wide — OPEN
`admin/components/ModalShell.tsx`'s `LField` (the shared label wrapper behind
`TextField`, and used directly by `CompanyEditor`, `TeamTab`, `CategoryEditor`,
`ChangeRequestsTab` and others) renders `<label>` as a sibling of its
`<input>`/`<textarea>`, with no `htmlFor`/`id` — never programmatically
associated. Every field built on it is an unnamed form control to a screen
reader. Same root cause independently found and fixed in `ProfileEditor.tsx`
(component-local, not built on `LField`) during Phase 3.

**Why it's still open:** `LField` is the base of dozens of call sites across
most admin editors. Only surfaces on `/admin/settings` in the current route
sweep because that's the one page rendering such a form outside a modal —
every other user is one click (open the editor) away from hitting it too.
Fixing `LField` itself is the 20-minute fix; auditing whether any call site
depends on the current DOM order (unlikely, but check) and re-verifying every
editor it's used in is the real cost. Deserves its own pass, not a rider on a
routing phase.

**Recommended solution.** Give `LField` a `fieldId` prop (or generate one via
`useId()`), render `htmlFor={fieldId}` on the label, and require every
`TextField`/direct `LField` caller to pass `id={fieldId}` to its control.
