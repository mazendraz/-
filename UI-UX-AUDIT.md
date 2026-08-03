# Al Assema — Full UI/UX, Responsive, RTL & Accessibility Audit

**Audit date:** 2026-08-01
**Auditor role:** Senior UI/UX Designer · Frontend Architect · QA Engineer · Accessibility Specialist
**Codebase:** `app/` (Vite + React 18 + React Router 6 + Tailwind 3.4.13)
**Benchmark bar:** Apple / Stripe / Linear / Vercel / Shopify / Notion
**Status:** REMEDIATION CLOSED OUT — see **§2.5 Closure status ledger** below. Most items fixed across Phases 1–6; open/partial items carry a reason and, where applicable, a `FIX-NOTES.md` cross-reference.

---

## 0. How this audit was performed

| Method | What it covered |
|---|---|
| **Static source review** | Every file under `app/src` — 111 source files: all 13 public routes, all 12 admin tabs, the provider dashboard, 40+ shared components, `index.css`, `tailwind.config.js`, `index.html` |
| **Live browser inspection** | Dev server at `localhost:5173`, real Chrome. Pages rendered in isolated iframes at **390 × 844 (mobile)**, **768 × 1024 (tablet)** and **1366 × 768 (desktop)**, in **Arabic (RTL)** and **English (LTR)** |
| **Computed-style probes** | Injected instrumentation measuring overflow, computed colours, contrast ratios, touch-target boxes, heading order, label association, generated CSS rules |
| **Generated-CSS verification** | Every suspect Tailwind class was checked against the CSS Tailwind actually emitted, so "this class does nothing" claims are proven, not inferred |

Findings marked **✅ VERIFIED LIVE** were confirmed by reading computed styles or measured geometry in the running app, not by reading code alone.

---

## 1. Scope reconciliation — the pages you listed vs. the pages that exist

Your brief describes an **e-commerce store**. This codebase is a **lead-generation services directory** for the New Administrative Capital. There is no cart, no checkout, no payment, no order, no coupon and no return anywhere in the product. Auditing invented pages would have produced fiction, so the audit below maps your checklist onto the routes that genuinely exist.

### 1.1 Routes that exist and were audited

**Public** (`app/src/main.tsx`)

| Route | File | Your checklist equivalent |
|---|---|---|
| `/` | `pages/Home.tsx` | Home |
| `/services` | `pages/Services.tsx` | Categories |
| `/services/:category` | `pages/ServiceCategory.tsx` | Category page |
| `/companies` | `pages/Companies.tsx` | Product listing |
| `/companies/:slug` | `pages/CompanyProfile.tsx` | Product page |
| `/start` | `pages/GuidedStart.tsx` | Guided finder (no equivalent) |
| `/saved` | `pages/Saved.tsx` | Wishlist |
| `/requests` | `pages/MyRequests.tsx` | Orders |
| `/messages` | `pages/Messages.tsx` | Customer↔provider chat |
| `/request` | `pages/RequestForm.tsx` | Checkout equivalent — the conversion form |
| `/terms`, `/privacy` | `pages/LegalPage.tsx` | Legal |
| `*` | `pages/NotFound.tsx` | 404 |
| router `errorElement` | `pages/ErrorPage.tsx` → `CrashScreen` | 500 / crash |
| Global overlay | `components/SearchOverlay.tsx` | Search |
| Global gate | `components/StatusScreen.tsx` | Maintenance / offline |

**Admin** (`/admin`, single-page tab shell — `pages/admin/index.tsx`): Overview, Leads (+ Waitlist), Companies, Categories/Services, Team, Reviews & Feedback, Change Requests, Conversations, Project Approvals, Site Status, Settings — plus `CompanyEditor`, `CategoryEditor`, `LeadModal`, `WaitlistDetailModal`, `AdminOfferingsPanel` modals.

**Provider** (`/provider` — `pages/ProviderDashboard.tsx`): Overview, Leads, Reviews, Projects, Offerings, Availability, Messages, Profile, Settings — plus `ProfileEditor`, `OfferingsEditor`, `AvailabilityControl`, `BusyWindowsEditor`, `WaitlistManager`, `ProviderChat`.

### 1.2 Gap list — screens in your brief that do not exist

| Requested screen | Status | Note |
|---|---|---|
| Product pages | ✗ | Nearest analogue is Company Profile + `OfferingCards` |
| Cart | ✗ | `lib/cart.ts` + `RequestBar` is a **request basket**, not a cart — no quantity, no persistence across companies, no checkout |
| Checkout | ✗ | `/request` submits a lead; no payment step |
| Login / Register | ✗ **notable gap** | `AuthGate` guards `/admin` and `/provider`, but there is **no public sign-in or registration UI**. Customers are identified by phone number in a form |
| Account pages | ✗ | No profile, no settings, no password change for customers |
| Coupons | ✗ | Bundle discount rules exist server-side (`bundleRules`), no coupon UI |
| Returns / Shipping / Payments | ✗ | Not applicable to a lead-gen model |
| Blog | ✗ | No blog route, no CMS |
| About / Contact pages | ⚠ Partial | Only `#about` / `#contact` anchors on the Home page — see **NAV-07**, these anchors are broken from any other route |
| Reviews (admin) | ✓ | Exists as `ReviewsTab` |
| Analytics (admin/provider) | ✓ Partial | `Charts.tsx` + `OverviewTab`; no dedicated Analytics screen |

---

## 2. Executive summary

### 2.1 Verdict

The app is **not at the production bar of Apple/Stripe/Linear/Vercel**. The architecture is sound and the code is unusually well-commented, but the presentation layer has three categories of failure that a user will hit within thirty seconds:

1. **A whole family of Tailwind classes silently emits nothing** — 42 call sites. The mobile bottom navigation has *no background*, image scrims *do not exist*, and active/hover states on the main nav *never render*. ✅ VERIFIED LIVE
2. **RTL is implemented by hand, inconsistently** — ~50 physical-direction utilities (`ml-`, `left-0`, `text-left`, `border-r`) with no logical-property equivalent. Arabic is the **default** locale, so these are default-path bugs, not edge cases.
3. **The design system is nominal** — 9 typography tokens exist in `tailwind.config.js`; the app uses **1,097 hardcoded `text-[NNpx]` values across 56 files** instead.

### 2.2 Severity counts

| Severity | Count | Meaning |
|---|---|---|
| 🔴 **Critical** | 14 | Broken/invisible UI, content unreadable, blocking a11y failure |
| 🟠 **High** | 46 | Clearly wrong on a main path; visible to most users |
| 🟡 **Medium** | 57 | Inconsistency, friction, or a failure on a secondary path |
| 🔵 **Low** | 39 | Polish, hygiene, maintainability |
| **Total** | **156** | |

> **Two findings were retracted during verification** (MSG-02, MSG-06). Every claim in this report was re-checked against source; where the code turned out to be correct, the finding is struck through rather than deleted, so you can see what was checked.

### 2.3 The ten things to fix first

| # | ID | One-line | Severity |
|---|---|---|---|
| 1 | **DS-01** | 42 Tailwind opacity classes emit no CSS — transparent bottom nav, missing scrims | 🔴 |
| 2 | **RTL-01** | Admin + Provider drawers slide in from the wrong side in Arabic | 🔴 |
| 3 | **A11Y-01** | `ModalShell` (every admin editor) has no `role`, focus trap, or Escape | 🔴 |
| 4 | **A11Y-02** | `useDialogA11y` never moves focus *into* the dialog — the trap is inert | 🔴 |
| 5 | **RESP-01** | `/saved`, `/requests`, `/messages` scroll horizontally on mobile in both languages | 🟠 |
| 6 | **NAV-01** | Seven different `pt-*` values used to clear one fixed header; two leave 4 px | 🟠 |
| 7 | **RTL-02** | `text-left` on 11 interactive cards + table headers — Arabic reads left-aligned | 🟠 |
| 8 | **I18N-01** | Every page title, description and OG tag is hardcoded English | 🟠 |
| 9 | **A11Y-05** | Icon-only delete button in `ConfirmDelete` has no accessible name | 🔴 |
| 10 | **TYPO-01** | 1,097 hardcoded font sizes; 13 distinct sizes on the Home page alone | 🟠 |

### 2.4 Scorecard

| Dimension | Score | Comment |
|---|---|---|
| Layout & spacing | 5 / 10 | Coherent instincts, no shared scale; seven header offsets |
| Responsive | 5 / 10 | Three pages overflow at 390 px; no `sm`-tier polish |
| Typography | 3 / 10 | Tokens defined, then ignored 1,097 times |
| Components | 6 / 10 | Good primitives, duplicated and diverged |
| Visual consistency | 4 / 10 | 5 radii, 3+ shadow systems, 6 font weights per page |
| Navigation | 5 / 10 | No account entry point; broken hash links; no URL state in dashboards |
| **RTL / LTR** | **3 / 10** | Default locale is the broken one |
| Forms | 6 / 10 | Validation is decent; labelling and error announcement are not |
| **Accessibility** | **3 / 10** | Modals, focus, contrast and touch targets all fail |
| Animation | 7 / 10 | Genuinely good — reduced-motion is respected thoroughly |
| UX / IA | 5 / 10 | Filters that silently do nothing; no loading feedback on refetch |
| Performance (UI) | 6 / 10 | Good code-splitting; zero image dimensions → CLS |
| Code quality (UI) | 4 / 10 | Two hand-copied sidebars, three empty-state patterns |

---

## 2.5 Closure status ledger

Snapshot taken at the end of the remediation work (Phases 0-6), before the closing commit. Every ID cited anywhere in this document (including per-page "see X" cross-references, which is why the count below exceeds the 156-item severity tally in §2.2) is listed once, mapped to one of three states:

- **✅ مقفول (closed)** — fixed and verified (build/tsc/eslint/manual or automated check) in the phase noted.
- **🟡 جزئي (partial)** — meaningfully improved but the original finding is not fully resolved; the note says what is done and what remains.
- **⭕ مفتوح (open)** — not started. Where a reason is known (product decision pending, business-logic change, out of `app/` scope, or a deliberate scope cut), it is given; a bare "—" means it simply was not reached in this pass.

**Totals:** 140 closed, 39 partial, 86 open (of 265 distinct IDs/cross-references tracked here).

Commit reference: the closing commit for this remediation is the one produced by `npm run ship -- "chore: close UI/UX audit — final verification report"`. Check `git log --oneline -1 -- UI-UX-AUDIT.md` for its hash — this document cannot self-reference a hash that did not exist until it was committed.


**§3 نظام التصميم (DS)**

| بند | الحالة | ملاحظة |
|---|---|---|
| DS-01 | ✅ مقفول | Phase 1 |
| DS-02 | ✅ مقفول | Phase 6 |
| DS-03 | ✅ مقفول | Phase 3 — see TYPO-01 |
| DS-04 | ✅ مقفول | Phase 3 |
| DS-05 | ✅ مقفول | Phase 3 |
| DS-06 | ⭕ مفتوح | — |
| DS-07 | 🟡 جزئي | Phase 3 — semantic warning/success tokens + CrashScreen exception documented; ~90 stock-Tailwind colour call sites remain, see FIX-NOTES.md Phase 3 |
| DS-08 | ⭕ مفتوح | — |

**§4 إتاحة الوصول (A11Y)**

| بند | الحالة | ملاحظة |
|---|---|---|
| A11Y-01 | ✅ مقفول | Phase 2 |
| A11Y-02 | ✅ مقفول | Phase 2 |
| A11Y-03 | ✅ مقفول | Phase 2 |
| A11Y-04 | ✅ مقفول | Phase 2 |
| A11Y-05 | ✅ مقفول | Phase 2 |
| A11Y-06 | 🟡 جزئي | Phase 2/4 — ConfirmDialog built and used for the availability toggle and category-delete cascade; ProjectApprovals/ReviewsTab deletes still use the old inline-armed pattern, see FIX-NOTES.md Phase 2 |
| A11Y-07 | ✅ مقفول | Phase 2 |
| A11Y-08 | ✅ مقفول | Phase 2 |
| A11Y-09 | ✅ مقفول | Phase 2 |
| A11Y-10 | ✅ مقفول | Phase 2/3 |
| A11Y-11 | 🟡 جزئي | Phase 2 — SaveButton/many controls bumped to 44px; ui-audit.spec.ts still flags footer links and a few chrome icons under 44px |
| A11Y-12 | 🟡 جزئي | Phase 3 — bottom-nav labels raised; not a hard floor everywhere |
| A11Y-13 | ⭕ مفتوح | confirmed still failing axe color-contrast (4.48:1 vs 4.5:1 required) in Phase 6 final verification — see FIX-NOTES.md |
| A11Y-14 | 🟡 جزئي | Phase 1 — DS-01 opacity fix makes these render at all; underlying contrast still marginal (A11Y-13) |
| A11Y-15 | ⭕ مفتوح | — |
| A11Y-16 | ⭕ مفتوح | — |
| A11Y-17 | 🟡 جزئي | Icon component built and used on ~most icons; a few raw spans still found and fixed opportunistically through Phase 6 |
| A11Y-18 | ⭕ مفتوح | — |
| A11Y-19 | 🟡 جزئي | Phase 6.4 — toggle transition scoped to transform only; role=switch/logical positioning not verified |
| A11Y-20 | ✅ مقفول | Phase 3 — see PERF-01 |

**§5 RTL والعربي**

| بند | الحالة | ملاحظة |
|---|---|---|
| RTL-01 | ✅ مقفول | Phase 1 |
| RTL-02 | 🟡 جزئي | Phase 1 — 19 no-restricted-syntax violations remained out of Phase 1's exact scope, see FIX-NOTES.md Phase 1 |
| RTL-03 | 🟡 جزئي | Phase 1 — same as RTL-02 |
| RTL-04 | 🟡 جزئي | Phase 1 — same as RTL-02 |
| RTL-05 | ✅ مقفول | Phase 4 — SidebarNav extraction |
| RTL-06 | ✅ مقفول | Phase 1/3 |
| RTL-07 | ⭕ مفتوح | — |
| RTL-08 | ⭕ مفتوح | explicitly flagged for later review, see FIX-NOTES.md Phase 1 |
| RTL-09 | 🟡 جزئي | Phase 6.4 fixed GuidedStart's instance; Services/Companies instances not verified |
| RTL-10 | ✅ مقفول | Phase 3 |
| RTL-11 | 🟡 جزئي | Phase 6.6 fixed the ReviewsTab status-pill instance of this pattern; the original admin page-title citation not independently re-verified post-refactor |
| RTL-12 | ✅ مقفول | Phase 4 |
| RTL-13 | ✅ مقفول | Phase 4 |
| RTL-14 | ✅ مقفول | Phase 6.6 |

**§6 التنقل (NAV)**

| بند | الحالة | ملاحظة |
|---|---|---|
| NAV-01 | ✅ مقفول | Phase 3 — --nav-h token |
| NAV-02 | ✅ مقفول | Phase 3 |
| NAV-03 | ⭕ مفتوح | explicit product decision — needs Mazen, not implemented per phase 5 instruction |
| NAV-04 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 — feature-sized |
| NAV-05 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| NAV-06 | 🟡 جزئي | Phase 4 — admin converted to nested routes; provider dashboard tabs still local useState, documented decision in FIX-NOTES.md Phase 4 |
| NAV-07 | ✅ مقفول | Phase 5 — real /about, /contact routes + hash-scroll for #reviews |
| NAV-08 | ⭕ مفتوح | both footer links now point at /about (still the same destination, just relocated) |
| NAV-09 | ⭕ مفتوح | — |
| NAV-10 | ⭕ مفتوح | — |
| NAV-11 | ⭕ مفتوح | — |
| NAV-12 | ⭕ مفتوح | — |

**§7 التجاوب (RESP)**

| بند | الحالة | ملاحظة |
|---|---|---|
| RESP-01 | ✅ مقفول | Phase 1 |
| RESP-02 | 🟡 جزئي | Phase 6.6 — Companies filter sheet + admin Leads table/cards moved to lg:; Home rails and CompanyProfile sidebar breakpoints not revisited |
| RESP-03 | ✅ مقفول | Phase 6.6 |
| RESP-04 | ✅ مقفول | Phase 6.6 |
| RESP-05 | ⭕ مفتوح | — |
| RESP-06 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| RESP-07 | ⭕ مفتوح | — |

**§8 الطباعة/التيبوغرافي (TYPO)**

| بند | الحالة | ملاحظة |
|---|---|---|
| TYPO-01 | ✅ مقفول | Phase 3 |
| TYPO-02 | ✅ مقفول | Phase 3 — lint rule + codemod |
| TYPO-03 | ✅ مقفول | Phase 3 |
| TYPO-04 | ✅ مقفول | Phase 3 |
| TYPO-05 | ⭕ مفتوح | — |

**§9 المكونات (CMP)**

| بند | الحالة | ملاحظة |
|---|---|---|
| CMP-01 | ⭕ مفتوح | — |
| CMP-02 | ✅ مقفول | Phase 4 |
| CMP-03 | ✅ مقفول | Phase 4 |
| CMP-04 | ✅ مقفول | Phase 4 |
| CMP-05 | ✅ مقفول | Phase 4 |
| CMP-06 | ✅ مقفول | Phase 4 |
| CMP-07 | ✅ مقفول | Phase 4 — see CODE-01 |
| CMP-08 | 🟡 جزئي | Phase 5 — nounKey/plural rework; aria-live and nav landmark not independently verified |
| CMP-09 | ✅ مقفول | Phase 4 — handle removed rather than made draggable, documented decision |
| CMP-10 | ✅ مقفول | Phase 4 — ARIA tabs pattern |
| CMP-11 | ⭕ مفتوح | — |
| CMP-12 | ✅ مقفول | Phase 4 — toast system |
| CMP-13 | ⭕ مفتوح | — |
| CMP-14 | ✅ مقفول | Phase 3/4 — retry action present |
| CMP-15 | ✅ مقفول | Phase 5 |

**§10 النماذج (FORM)**

| بند | الحالة | ملاحظة |
|---|---|---|
| FORM-01 | ⭕ مفتوح | — |
| FORM-02 | ⭕ مفتوح | — |
| FORM-03 | ⭕ مفتوح | — |
| FORM-04 | ⭕ مفتوح | — |
| FORM-05 | ⭕ مفتوح | — |
| FORM-06 | ⭕ مفتوح | — |
| FORM-07 | ⭕ مفتوح | — |
| FORM-08 | ⭕ مفتوح | see DS-08 |
| FORM-09 | ⭕ مفتوح | — |

**§11 UX والتفاعل**

| بند | الحالة | ملاحظة |
|---|---|---|
| UX-01 | ⭕ مفتوح | — |
| UX-02 | ✅ مقفول | Phase 1 |
| UX-03 | 🟡 جزئي | Phase 1 — bundled with UX-02, not independently re-verified |
| UX-04 | ✅ مقفول | already present — desktop bar has Available now toggle |
| UX-05 | ✅ مقفول | Phase 4 |
| UX-06 | ✅ مقفول | Phase 4 |
| UX-07 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| UX-08 | ✅ مقفول | Phase 4 |
| UX-09 | 🟡 جزئي | Phase 4 — CompanyEditor/CategoryEditor/ProfileEditor/request covered; provider tab-switch not covered, documented decision in FIX-NOTES.md Phase 4 |
| UX-10 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| UX-11 | 🟡 جزئي | Companies has aria-live + reset; Services clear-search action not added |
| UX-12 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| UX-13 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| UX-14 | ⭕ مفتوح | explicit product decision — needs Mazen, not implemented per phase 5 instruction |
| UX-15 | ✅ مقفول | Phase 5 — real /contact route |

**§12 الصفحة الرئيسية (HOME)**

| بند | الحالة | ملاحظة |
|---|---|---|
| HOME-01 | ✅ مقفول | Phase 1 — see DS-01 |
| HOME-02 | ✅ مقفول | Phase 4 — see UX-05 |
| HOME-03 | 🟡 جزئي | Phase 6.4 fixed reduced-motion; duration/readability tuning not revisited |
| HOME-04 | ✅ مقفول | Phase 6.7 |
| HOME-05 | ✅ مقفول | Phase 6.7 |
| HOME-06 | ✅ مقفول | Phase 6.7 |
| HOME-07 | ✅ مقفول | Phase 6.7 |
| HOME-08 | ⭕ مفتوح | — |
| HOME-09 | ⭕ مفتوح | — |
| HOME-10 | ⭕ مفتوح | — |
| HOME-11 | 🟡 جزئي | Phase 3 — width/height likely covered by the ~40-site PERF-01 pass; fetchpriority not verified |
| HOME-12 | ✅ مقفول | Phase 6.7 |

**§12 الخدمات (SRV)**

| بند | الحالة | ملاحظة |
|---|---|---|
| SRV-01 | ✅ مقفول | Phase 5 — see I18N-01 |
| SRV-02 | ⭕ مفتوح | see A11Y-16 |
| SRV-03 | ⭕ مفتوح | see UX-11 |
| SRV-04 | 🟡 جزئي | see RTL-09 |
| SRV-05 | ✅ مقفول | Phase 3 |
| SRV-06 | ✅ مقفول | Phase 6.4 |
| SRV-07 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 — design decision |

**§12 الفئات (CAT)**

| بند | الحالة | ملاحظة |
|---|---|---|
| CAT-01 | 🟡 جزئي | NAV-01 part closed, A11Y-16 part open |
| CAT-02 | ⭕ مفتوح | — |
| CAT-03 | ⭕ مفتوح | — |

**§12 قائمة الشركات (CO)**

| بند | الحالة | ملاحظة |
|---|---|---|
| CO-01 | ✅ مقفول | Phase 6.7 |
| CO-02 | ✅ مقفول | Phase 6.7 |
| CO-03 | ✅ مقفول | verified not a real bug in Phase 6 — .field-input's 16px wins the cascade |
| CO-04 | ✅ مقفول | Phase 5 — see CMP-15 |
| CO-05 | ✅ مقفول | Phase 6.7 |

**§12 ملف الشركة (CP)**

| بند | الحالة | ملاحظة |
|---|---|---|
| CP-01 | ✅ مقفول | Phase 1 — see DS-01 |
| CP-02 | ✅ مقفول | Phase 3 — --bottom-nav-h token |
| CP-03 | ✅ مقفول | Phase 6.2/6.3 |
| CP-04 | 🟡 جزئي | Tabs component in use; ?tab= URL state not verified |
| CP-05 | ✅ مقفول | Phase 6.7 |
| CP-06 | ✅ مقفول | Phase 6.7 |
| CP-07 | ✅ مقفول | visible prev/next + bidi-safe counter + swipe added; keyboard/button direction convention is spatially consistent by design |
| CP-08 | ⭕ مفتوح | see DS-07 |
| CP-09 | ⭕ مفتوح | see UX-12 |
| CP-10 | ✅ مقفول | Phase 6.7 — aggregateRating added; address/telephone deliberately omitted, not in the public data model |
| CP-11 | ⭕ مفتوح | — |

**§12 البداية الموجّهة (GS)**

| بند | الحالة | ملاحظة |
|---|---|---|
| GS-01 | 🟡 جزئي | see RTL-02 |
| GS-02 | ⭕ مفتوح | see A11Y-15 |
| GS-03 | ✅ مقفول | already present — step progress bar + count |
| GS-04 | ✅ مقفول | Phase 6.7 |
| GS-05 | ✅ مقفول | Phase 6.7 |

**§12 المحفوظات (SAV)**

| بند | الحالة | ملاحظة |
|---|---|---|
| SAV-01 | ✅ مقفول | Phase 1 — see RESP-01 |
| SAV-02 | ✅ مقفول | Phase 2 — see A11Y-08 |
| SAV-03 | ✅ مقفول | Phase 1 — see DS-01 |
| SAV-04 | ✅ مقفول | already present — saved_sub explains device-only storage |
| SAV-05 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |

**§12 الطلبات (REQ)**

| بند | الحالة | ملاحظة |
|---|---|---|
| REQ-01 | ✅ مقفول | Phase 1 — see RESP-01 |
| REQ-02 | ✅ مقفول | Phase 2 — see A11Y-03/04 |
| REQ-03 | ✅ مقفول | Phase 1 — see DS-01 |
| REQ-04 | ⭕ مفتوح | see A11Y-15 |
| REQ-05 | 🟡 جزئي | see RTL-04 |

**§12 الرسائل (MSG)**

| بند | الحالة | ملاحظة |
|---|---|---|
| MSG-01 | ✅ مقفول | Phase 1 — see RESP-01 |
| MSG-02 | ✅ مقفول | retracted in original audit — no action needed |
| MSG-03 | ⭕ مفتوح | — |
| MSG-04 | ⭕ مفتوح | — |
| MSG-05 | ✅ مقفول | Phase 1 — see DS-01 |
| MSG-06 | ✅ مقفول | retracted in original audit — no action needed |

**§12 نموذج الطلب (RF)**

| بند | الحالة | ملاحظة |
|---|---|---|
| RF-01 | ✅ مقفول | Phase 3 — see NAV-01 |
| RF-02 | ⭕ مفتوح | see FORM-06 |
| RF-03 | ⭕ مفتوح | see FORM-02 |
| RF-04 | ✅ مقفول | Phase 1 — see DS-01 |
| RF-05 | ⭕ مفتوح | see A11Y-15 |
| RF-06 | ✅ مقفول | Phase 4 — see UX-09 |
| RF-07 | ⭕ مفتوح | — |
| RF-08 | ⭕ مفتوح | — |

**§12 الصفحات القانونية (LEG)**

| بند | الحالة | ملاحظة |
|---|---|---|
| LEG-01 | ✅ مقفول | already present — standard container in use |
| LEG-02 | ⭕ مفتوح | — |
| LEG-03 | 🟡 جزئي | Phase 6.7 — print stylesheet added; TOC and last-updated date not added |
| LEG-04 | ⭕ مفتوح | see A11Y-15 |

**§12 صفحة 404 (NF)**

| بند | الحالة | ملاحظة |
|---|---|---|
| NF-01 | ✅ مقفول | Phase 1 — see DS-01 |
| NF-02 | ✅ مقفول | Phase 3 — see NAV-01 |
| NF-03 | ✅ مقفول | Phase 6.7 |
| NF-04 | ✅ مقفول | Phase 5 — see I18N-01 |
| NF-05 | ⭕ مفتوح | server/hosting config, outside app/ scope — logged FIX-NOTES.md Phase 6.7 |

**§12 صفحات الخطأ (ERR)**

| بند | الحالة | ملاحظة |
|---|---|---|
| ERR-01 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ERR-02 | ✅ مقفول | already present |
| ERR-03 | ✅ مقفول | Phase 6.7 |

**§12 حالة الصيانة (ST)**

| بند | الحالة | ملاحظة |
|---|---|---|
| ST-01 | ✅ مقفول | Phase 6.7 |
| ST-02 | ⭕ مفتوح | business-logic change — needs Mazen, logged FIX-NOTES.md Phase 6.7 |
| ST-03 | ⭕ مفتوح | — |

**§12 البحث (SO)**

| بند | الحالة | ملاحظة |
|---|---|---|
| SO-01 | ✅ مقفول | Phase 1 — see DS-01 |
| SO-02 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| SO-03 | ✅ مقفول | Phase 6.7 |
| SO-04 | ⭕ مفتوح | — |

**§13 لوحة الأدمن (ADM)**

| بند | الحالة | ملاحظة |
|---|---|---|
| ADM-01 | ✅ مقفول | border-e already in use |
| ADM-02 | ✅ مقفول | Phase 2/4 — min-h-[44px] action buttons |
| ADM-03 | 🟡 جزئي | see RTL-02 |
| ADM-04 | ✅ مقفول | Phase 6.6 — LeadsPage lg: breakpoint |
| ADM-05 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-06 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-07 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-08 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-09 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-10 | 🟡 جزئي | see RTL-02 |
| ADM-11 | ⭕ مفتوح | see DS-07 |
| ADM-12 | ✅ مقفول | Phase 1 — see DS-01 |
| ADM-13 | ✅ مقفول | Phase 1 — see DS-01 |
| ADM-14 | 🟡 جزئي | see RTL-04, CMP-10 |
| ADM-15 | ✅ مقفول | Phase 1 — see DS-01 |
| ADM-16 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-17 | 🟡 جزئي | Phase 3 — sizes tokenised; icon-picker live preview not added |
| ADM-18 | ✅ مقفول | Phase 1 — see DS-01, RTL-03 |
| ADM-19 | ✅ مقفول | Phase 1 — see DS-01, RTL-02/03 |
| ADM-20 | 🟡 جزئي | see RTL-02 |
| ADM-21 | ✅ مقفول | Phase 1 — see DS-01, RTL-02 |
| ADM-22 | ✅ مقفول | Phase 1 — see DS-01, MSG-02 |
| ADM-23 | ✅ مقفول | Phase 1 — see DS-01 |
| ADM-24 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-25 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 — needs Mazen |
| ADM-26 | 🟡 جزئي | see RTL-11 |
| ADM-27 | ✅ مقفول | Phase 6.7 |
| ADM-28 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| ADM-29 | ⭕ مفتوح | — |

**§14 لوحة المزوّد (PRV)**

| بند | الحالة | ملاحظة |
|---|---|---|
| PRV-01 | ✅ مقفول | border-e already in use |
| PRV-02 | 🟡 جزئي | see RTL-02 |
| PRV-03 | ✅ مقفول | Phase 4 — SidebarNav unification |
| PRV-04 | 🟡 جزئي | TYPO-01 closed, DS-07 partial |
| PRV-05 | ✅ مقفول | Phase 1 — see DS-01 |
| PRV-06 | ✅ مقفول | Phase 4 — SidebarNav extraction |
| PRV-07 | 🟡 جزئي | Phase 6.4 fixed the transition; role=switch/logical positioning not independently verified |
| PRV-08 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| PRV-09 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| PRV-10 | ✅ مقفول | Phase 1 — see DS-01 |
| PRV-11 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| PRV-12 | ⭕ مفتوح | shell-level MSG-03/04 polish not done |
| PRV-13 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |
| PRV-14 | ⭕ مفتوح | see RESP-06 |
| PRV-15 | ⭕ مفتوح | logged FIX-NOTES.md Phase 6.7 |

**§15 التدويل (I18N)**

| بند | الحالة | ملاحظة |
|---|---|---|
| I18N-01 | ✅ مقفول | Phase 5 |
| I18N-02 | ✅ مقفول | Phase 5 |
| I18N-03 | ✅ مقفول | Phase 5 — see CMP-15 |
| I18N-04 | ✅ مقفول | Phase 5 |
| I18N-05 | ✅ مقفول | Phase 5 |
| I18N-06 | ✅ مقفول | Phase 5 |
| I18N-07 | ✅ مقفول | Phase 5 |

**§16 الحركة (ANIM)**

| بند | الحالة | ملاحظة |
|---|---|---|
| ANIM-02 | ✅ مقفول | Phase 4 — see UX-05 |
| ANIM-03 | ✅ مقفول | Phase 6.4 |
| ANIM-04 | ✅ مقفول | Phase 6.4 |
| ANIM-05 | ✅ مقفول | Phase 6.4 |
| ANIM-06 | ✅ مقفول | Phase 6.4 |
| ANIM-07 | ✅ مقفول | already present — unified at -4px since Phase 3's DS-05 work |
| ANIM-08 | ✅ مقفول | Phase 6.4 |

**§17 الأداء (PERF)**

| بند | الحالة | ملاحظة |
|---|---|---|
| PERF-01 | ✅ مقفول | Phase 3 |
| PERF-02 | ⭕ مفتوح | — |
| PERF-03 | ✅ مقفول | Phase 6.1 |
| PERF-04 | ✅ مقفول | Phase 6.2 — reduced 4 concurrent blur surfaces to 2 (TopNav, desktop RequestBar) |
| PERF-05 | 🟡 جزئي | Phase 4 — admin nested + per-tab split; provider still one chunk |
| PERF-06 | ✅ مقفول | Phase 6.5 |
| PERF-07 | ✅ مقفول | Phase 6.5 |

**§18 جودة الكود (CODE)**

| بند | الحالة | ملاحظة |
|---|---|---|
| CODE-01 | ✅ مقفول | Phase 4 |
| CODE-02 | ✅ مقفول | Phase 4 |
| CODE-03 | ✅ مقفول | Phase 4 — see CMP-05 |
| CODE-04 | ✅ مقفول | Phase 4 — see CMP-06 |
| CODE-05 | 🟡 جزئي | TYPO-01 closed; DS-07/RTL-02..04 partial |
| CODE-06 | 🟡 جزئي | CompanyProfile.tsx reduced ~900→805 lines (gallery/lightbox extracted); provider tabs not yet split into files — logged FIX-NOTES.md Phase 6.7 |
| CODE-07 | ✅ مقفول | Phase 1/3 — eslint-plugin-tailwindcss no-contradicting-classname |
| CODE-08 | 🟡 جزئي | Phase 6.4/6.6 removed .transition-all-spring and the duplicate .rtl-flip rule; .input-premium/.shake/.masonry-*/glass duplicates/Alexandria still present — logged FIX-NOTES.md Phase 6.7 |
| CODE-09 | ✅ مقفول | Phase 0 |

---
## 3. 🔴 CRITICAL — the design system emits broken CSS

### DS-01 — 42 Tailwind opacity modifiers generate no CSS at all ✅ VERIFIED LIVE

- **Severity:** 🔴 Critical
- **Pages:** Every page. Home, Companies, CompanyProfile, Saved, MyRequests, Messages, NotFound, RequestForm, SearchOverlay, all admin tabs, ProviderDashboard
- **Component:** `TopNav`, `BottomNav`, `SaveButton`, `CatalogError`, `RequestBar`, `SearchOverlay`, `fields.tsx`, `CompanyEditor`, and 34 more

**Description.** Tailwind 3.4's default opacity scale is `0, 5, 10, 15, 20, … 95, 100`. A bare modifier that is **not** in the scale (`/6`, `/8`, `/12`, `/14`, `/18`, `/68`, `/72`, `/96`, `/97`) produces **no rule at all**. The codebase uses these 42 times.

Proven by reading the CSS Tailwind actually generated in the running dev server:

```
bg-white/97                    → false   (used in BottomNav.tsx:19)
bg-white/96                    → false   (used in CompanyProfile.tsx:128)
bg-primary/8                   → false   (used in TopNav.tsx:104, +11 more)
bg-primary/6                   → false   (used in TopNav.tsx:107, +4 more)
bg-error/8                     → false   (used in SaveButton.tsx:30, +7 more)
from-black/72, from-black/68   → false   (used in Home.tsx:326, 340, 354)
bg-surface-container-lowest/97 → false   (used in RequestBar.tsx:52)
border-primary/18              → false   (used in RequestForm.tsx:593, +3 more)
--- control group ---
bg-primary/10, bg-primary/15, bg-primary/5, bg-black/40, border-error/25 → true
```

Computed styles from the live mobile render confirm the consequence:

```
BottomNav   → background-color: rgba(0, 0, 0, 0)   ← fully transparent
Home card   → background-image: none               ← the scrim does not exist
```

**Why it is a problem.**

- The **mobile bottom tab bar has no background**. Page content scrolls visibly behind four navigation icons. This is the single most visible defect in the product and it is on every mobile page.
- The **sticky mobile CTA bar on Company Profile** (`bg-white/96`) is likewise transparent — the primary conversion button floats over scrolling content.
- **Home "Featured projects" cards** rely on `from-black/72` to darken the photo under white headings. With no gradient, white 20 px text sits directly on a photograph. Contrast is unpredictable and frequently below 2:1.
- Every `hover:bg-primary/6` and active `bg-primary/8` in the top navigation is dead — the active nav item is indistinguishable from the inactive ones except by colour alone (which is itself a WCAG 1.4.1 failure).
- The `SaveButton` "saved" state loses its tint, weakening the only feedback the control gives.

**Recommended solution.**

1. Global find-and-replace to bracket syntax: `bg-primary/8` → `bg-primary/[0.08]`, `bg-white/97` → `bg-white/[0.97]`, `from-black/72` → `from-black/[0.72]`, etc. This is mechanical and safe.
2. Better: extend `theme.extend.opacity` in `tailwind.config.js` with the values the design actually uses (`6, 8, 12, 14, 18, 68, 72, 96, 97`) so bare modifiers keep working and the set is documented.
3. Add a CI guard — an ESLint rule or a `grep` in the build — that fails on a colour modifier whose value is not in the opacity scale. This class of bug is invisible in review and must be caught mechanically.

**Expected improvement.** Restores an opaque mobile tab bar and CTA bar, restores legibility on all image-overlay cards, restores active/hover feedback across the entire navigation. Roughly 40 visual regressions fixed by one change.

---

### DS-02 — `darkMode: "class"` is configured but no dark theme exists

- **Severity:** 🟡 Medium
- **Page:** Global · **Component:** `tailwind.config.js:3`, `index.html:2`

**Description.** `darkMode: "class"` is set and `<html class="light">` is hardcoded, but not a single `dark:` variant exists in the codebase and the palette has no dark tokens.

**Why it is a problem.** Dead configuration signals an intent that was never delivered; a future contributor will add `dark:` classes assuming a theme exists. Users on OS dark mode get a full-brightness white page with `<meta name="theme-color" content="#0f172a">` — a near-black browser chrome above a white page, which looks broken on Android and iOS PWA.

**Recommended solution.** Either remove `darkMode` and the `light` class, or ship a real dark palette. Interim: set `<meta name="color-scheme" content="light">` and change `theme-color` to `#005578` (the brand primary) so browser chrome matches the app.

**Expected improvement.** Removes a jarring colour clash on mobile browser chrome; removes a maintenance trap.

---

### DS-03 — Typography tokens defined then abandoned

- **Severity:** 🟠 High → see **TYPO-01** for the full finding
- **Component:** `tailwind.config.js:95-105`

**Description.** Nine `fontSize` tokens are defined (`display-xl`, `headline-lg`, `headline-md`, `body-lg`, `body-md`, `label-md`, `label-sm`, plus mobile variants), each with paired line-height, letter-spacing and weight. The app uses them roughly 60 times and uses raw `text-[NNpx]` **1,097 times across 56 files**.

**Why it is a problem.** The tokens are the design system; bypassing them means there is no design system. Measured on the Home page alone, the live DOM contains **13 distinct font sizes, 6 font weights and 22 distinct line-heights**. Nothing enforces the vertical rhythm, and a designer changing "body text" has to touch 56 files.

**Recommended solution.** Freeze the scale at 6–7 steps, express it as tokens, and codemod the 1,097 raw values onto the nearest token. Add an ESLint rule banning `text-[…px]` outside a whitelist.

**Expected improvement.** One place to tune the type ramp; visibly steadier rhythm; the Arabic and English renderings stop diverging (see **RTL-10**).

---

### DS-04 — `borderRadius` extension is a no-op; five radii in use

- **Severity:** 🔵 Low · **Component:** `tailwind.config.js:56-61`

**Description.** The `borderRadius` extension redefines `DEFAULT: 0.25rem`, `lg: 0.5rem`, `xl: 0.75rem`, `full: 9999px` — all identical to Tailwind's defaults. Meanwhile the live Home page renders **five** distinct radii: 8, 12, 16, 40, 9999 px, plus ad-hoc `rounded-t-[28px] md:rounded-t-[40px]` (`Home.tsx:171`) and `rounded-t-3xl` (`Companies.tsx:271`).

**Why it is a problem.** Radius is one of the strongest carriers of brand feel; five values with no rule reads as "assembled" rather than "designed". Compare Linear (2 radii) or Stripe (3).

**Recommended solution.** Define a real ramp — e.g. `sm: 8px` (chips, badges), `md: 12px` (inputs, buttons), `lg: 16px` (cards), `xl: 24px` (sheets, modals), `full`. Delete the no-op overrides. Ban arbitrary radii.

**Expected improvement.** Immediately more coherent surface language across cards, sheets and modals.

---

### DS-05 — Three competing shadow systems

- **Severity:** 🟡 Medium · **Component:** `index.css:70-117`, `tailwind.config.js:76-80`

**Description.** Shadows are defined in three places with overlapping semantics: Tailwind `boxShadow` (`card-hover`, `bloom`), CSS utility classes (`soft-bloom`, `shadow-bloom`, `shadow-soft`, `soft-shadow`, `card-lift`, `shadow-bloom-hover`, `soft-bloom-hover`, `shadow-soft-hover`), and inline arbitrary values (`shadow-[0_8px_32px_rgba(0,85,120,0.10)]` in `Home.tsx:251`, `shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.08)]` in `CompanyProfile.tsx:128`, and the six-value hero button stack in `Home.tsx:122-123`).

Note `soft-bloom` and `shadow-soft` and `soft-shadow` are three different names for near-identical effects.

**Why it is a problem.** Two adjacent cards can carry visually different elevations for no semantic reason. Hover lift is `-4px`, `-5px`, `-6px` and `-2px` depending on which of the four hover classes a card happened to get.

**Recommended solution.** Collapse to a four-step elevation scale (`e0`–`e3`) with one hover promotion rule. Delete the aliases. Move the two inline shadows into the scale.

**Expected improvement.** Consistent perceived depth; hover feedback that feels like one product.

---

### DS-06 — Spacing tokens exist but layout uses raw Tailwind units

- **Severity:** 🟡 Medium · **Component:** `tailwind.config.js:62-72`

**Description.** `stack-sm/md/lg/xl`, `gutter`, `margin-mobile`, `margin-desktop` and `unit` are defined. `px-margin-mobile md:px-margin-desktop` and `gap-gutter` are used consistently on public list pages — good. But vertical rhythm everywhere uses raw values: `py-10 md:py-14`, `py-14 md:py-20`, `pt-14 md:pt-20 pb-20 md:pb-28`, `pb-8 md:pb-10`, `space-y-4`, `space-y-5`, `mb-7`, `mb-5`, `mt-3`. The `stack-*` tokens appear only in `py-stack-xl` and `mt-stack-xl`.

**Why it is a problem.** Section rhythm on the Home page steps 40/56 → 56/80 → 56/80 → 56/80 → 56/112 px with no rule. Admin uses `p-4 md:p-6`; Provider uses a flat `p-6` (`ProviderDashboard.tsx:297`) — the two dashboards have different mobile gutters.

**Recommended solution.** Adopt a 4 px base with named section spacings; replace ad-hoc paddings. Unify the two dashboard content paddings.

**Expected improvement.** Predictable vertical rhythm; the two internal tools stop feeling like different products.

---

### DS-07 — 29 hardcoded hex colours bypass the palette

- **Severity:** 🟡 Medium
- **Component:** `CrashScreen.tsx` (10), `ProviderDashboard.tsx` (8), `Charts.tsx` (5), `OverviewTab.tsx` (4), `BusyWindowsEditor.tsx` (1), `ChangeRequestsTab.tsx` (1); plus `index.css` which hardcodes `#005578`, `#f1f4f8`, `#bfc7cf`, `#181c1f`, `#70787f`, `#9aa0a6`, `#ba1a1a` in 12 places

**Description.** The Material palette is fully tokenised in `tailwind.config.js`, yet charts, the crash screen and several dashboard panels use literal hex.

Additionally, Tailwind's stock palette leaks in alongside the design palette: `bg-amber-500`, `text-amber-700`, `bg-amber-50/100`, `bg-green-50`, `text-green-600/700`, `border-green-300`, `text-gray-*`. These are not brand colours and were never contrast-checked against the design tokens.

**Why it is a problem.** A palette change will silently miss these. The amber/green "busy/available" semantics have no token, so the same state is `amber-500` in one place and `amber-600` in another.

**Recommended solution.** Add semantic tokens: `--warning`, `--warning-container`, `--success`, `--success-container`, `--info`. Replace every stock-Tailwind and hex colour. `CrashScreen` may legitimately keep inline styles (it must render when CSS fails) — document that exception explicitly in the file.

**Expected improvement.** Single source of colour truth; state colours become themeable and testable.

---

### DS-08 — `input-premium` and `modal-input` are dead or divergent

- **Severity:** 🔵 Low · **Component:** `index.css:113-117`, `174-189`

**Description.** Three input styles coexist: `.field-input` (14 px radius, 1.5 px border, `#005578` focus ring), `.modal-input` (8 px radius, 1 px border, different focus ring), and `.input-premium` (focus ring in `rgba(113,69,0,0.2)` — a brown that appears nowhere else in the palette; the class appears to be unused).

**Why it is a problem.** Inputs in modals look different from inputs on pages, for no reason a user could name. The orphan `.input-premium` is a landmine.

**Recommended solution.** Delete `.input-premium`. Merge `.modal-input` into `.field-input` with a size variant. One input, two sizes.

**Expected improvement.** Forms feel like one system; modal forms stop looking like a different app.

---

## 4. 🔴 CRITICAL — Accessibility

### A11Y-01 — `ModalShell` has no dialog semantics, focus trap, Escape, or scroll lock

- **Severity:** 🔴 Critical
- **Pages:** Admin — Company editor, Category editor, Team member editor, Offerings panel, and every screen that uses it
- **Component:** `pages/admin/components/ModalShell.tsx:1-13`

**Description.** The shared admin modal renders as a plain `<div>`:

```jsx
<div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center …">
  <div className="bg-surface-container-lowest w-full …">
```

There is no `role="dialog"`, no `aria-modal`, no `aria-labelledby` pointing at the `<h2>`, no focus trap, no Escape handler, no focus-on-open, no focus restore, no `body` scroll lock, and no backdrop click-to-dismiss. The `useDialogA11y` hook exists in the codebase and is simply not used here.

**Why it is a problem.**

- A screen reader announces the page behind the modal, not the modal. The user has no idea a dialog opened.
- Keyboard focus stays on the trigger; Tab walks the page *behind* the overlay, focusing invisible controls.
- Escape does nothing — the only exit is a mouse click on a 40 px × 40 px `×`.
- The background scrolls under the modal on mobile, so dismissing it can leave the admin somewhere unexpected.
- WCAG 2.1 failures: 2.1.2 (No Keyboard Trap — inverse), 2.4.3 (Focus Order), 4.1.2 (Name, Role, Value).

**Recommended solution.** Wire `ModalShell` to `useDialogA11y` (after fixing **A11Y-02**): add `role="dialog" aria-modal="true" aria-labelledby={titleId}`, focus the panel on open, trap Tab, close on Escape and backdrop click, lock `body` overflow, restore focus on close. Fix once — every admin modal inherits it.

**Expected improvement.** Every admin editor becomes keyboard- and screen-reader-operable. Single highest-leverage a11y fix in the codebase.

---

### A11Y-02 — `useDialogA11y` never moves focus into the dialog, so the trap never engages

- **Severity:** 🔴 Critical
- **Pages:** Home (review modal), Companies (filter sheet), TopNav (drawer), CompanyProfile (3 dialogs), SearchOverlay
- **Component:** `hooks/useDialogA11y.ts:19-55`

**Description.** The hook restores focus on close and provides a `trapTab` handler, but **never focuses anything inside the dialog when it opens**. `trapTab` is a React `onKeyDown` bound to the panel — it only fires when focus is already inside the panel. Since focus never enters, the handler never fires and Tab moves freely through the page behind the overlay.

```ts
useEffect(() => {
  if (!open) return;
  const prev = document.activeElement as HTMLElement | null;
  return () => { prev?.focus(); };   // ← restore only; no focus-in
}, [open]);
```

**Why it is a problem.** Every dialog in the public site presents as accessible (there is a hook, there is a `role`) while being functionally inaccessible. Keyboard users tab into hidden page content behind a blurred backdrop. Background content is not `aria-hidden`/`inert`, so screen-reader virtual cursors read straight through the overlay.

**Recommended solution.** On open: focus the first focusable element (or the panel itself with `tabIndex={-1}`), and set `aria-hidden="true"` / `inert` on the app root. Keep the Escape and restore logic. Consider replacing the custom trap with the native `<dialog>` element and `showModal()`, which gives trap + Escape + backdrop + inert for free in all current browsers.

**Expected improvement.** All eight public dialogs become genuinely keyboard-accessible; screen readers stop reading through overlays.

---

### A11Y-03 — Five dialogs have no accessible name

- **Severity:** 🟠 High
- **Pages:** TopNav mobile drawer, Companies filter sheet, MyRequests detail modal, Admin drawer, Provider drawer
- **Component:** `TopNav.tsx:249`, `Companies.tsx:269`, `MyRequests.tsx:371`, `admin/index.tsx:198`, `ProviderDashboard.tsx:265`

**Description.** These all render `role="dialog" aria-modal` with no `aria-label` or `aria-labelledby`. `Home.tsx:563` and `SearchOverlay.tsx:103` do it correctly — proving the pattern is known and just not applied consistently.

**Why it is a problem.** A screen reader announces "dialog" with no indication of what opened. WCAG 4.1.2.

**Recommended solution.** Add `aria-labelledby` pointing at each panel's heading; where there is no heading (drawers) add `aria-label={t(locale,"nav_menu")}`.

**Expected improvement.** Dialogs announce their purpose; navigation drawers become usable non-visually.

---

### A11Y-04 — `MyRequests` detail modal has no focus management at all

- **Severity:** 🟠 High · **Page:** `/requests` · **Component:** `MyRequests.tsx:371-384`

**Description.** Unlike the other public dialogs, this one does not call `useDialogA11y` at all — no Escape, no trap, no focus restore. Its close button uses `-mr-1.5` (physical margin, see **RTL-04**).

**Recommended solution.** Route it through the same fixed `ModalShell`/`useDialogA11y` primitive as everything else.

**Expected improvement.** Consistent dismiss behaviour; keyboard users can leave the dialog.

---

### A11Y-05 — Icon-only delete button has no accessible name

- **Severity:** 🔴 Critical
- **Pages:** Admin — Companies, Categories, Team, Offerings, Projects, Reviews
- **Component:** `pages/admin/components/confirm.tsx:18-22`

**Description.**

```jsx
<button onClick={() => setArmed(true)} className="…">
  <span className="material-symbols-outlined text-[16px]">delete</span>
  {big ? `${t(locale,"admin_delete")} ${label}` : ""}
</button>
```

When `big` is false the button's only content is a Material Symbols **ligature glyph**. There is no `aria-label`, no `title`, no visually-hidden text. A screen reader announces the literal string "delete" only if the font ligature happens not to apply to the accessibility tree — in practice it announces the raw text node, which gives no object context ("delete *what*?").

**Why it is a problem.** This is the **destructive** action in the admin console and it is unlabelled. A screen-reader user cannot tell which row's delete they are on. WCAG 4.1.2 and 3.3.2.

**Recommended solution.** Always pass an accessible name: `aria-label={`${t(locale,"admin_delete")} ${label}`}`. Do the same for every other icon-only control (see **A11Y-06**).

**Expected improvement.** Destructive actions become identifiable and safe for non-visual users.

---

### A11Y-06 — Two-step inline confirm is not a confirmation dialog

- **Severity:** 🟠 High · **Component:** `confirm.tsx` (`ConfirmDelete`, `ConfirmAction`)

**Description.** The "armed" pattern swaps the trigger button in place for a `[Delete] [Cancel]` pair. There is no dialog, no statement of consequence ("this will permanently remove 14 leads"), no focus move to the confirm button, no Escape to disarm, and no timeout — an armed button stays armed indefinitely.

**Why it is a problem.** Replacing a button in place causes a **layout shift** at the moment of a destructive decision, so the "Delete" button can land where the user's cursor already was. There is nothing to prevent a double-click from arming and confirming in one gesture path. No undo exists anywhere in the app.

**Recommended solution.** Use a real confirmation dialog for destructive actions: name the object, state the consequence, put the destructive verb on the right (LTR) / start (RTL), focus **Cancel** by default, support Escape. Reserve the inline pattern for reversible actions, and add a toast with **Undo** where the backend allows it.

**Expected improvement.** Fewer accidental deletions; the app stops feeling dangerous to operate.

---

### A11Y-07 — No skip-to-content link anywhere

- **Severity:** 🟠 High · **Pages:** All · **Component:** `RootLayout.tsx`, `admin/index.tsx`, `ProviderDashboard.tsx`

**Description.** There is no "Skip to main content" link. On the public site a keyboard user tabs through 2 nav links, search, saved, requests, language toggle before reaching page content — on every navigation. In the drawer it is worse.

**Why it is a problem.** WCAG 2.4.1 (Bypass Blocks) — a Level A failure.

**Recommended solution.** Add a visually-hidden-until-focused skip link as the first child of `RootLayout` and both dashboards, targeting `<main id="main">`. Add `id="main"` to the existing `<main>` in `RootLayout.tsx:79`.

**Expected improvement.** Level A compliance; materially faster keyboard navigation.

---

### A11Y-08 — Search inputs have no label ✅ VERIFIED LIVE

- **Severity:** 🟠 High
- **Pages:** `/saved`, `/companies`, `/services`, all admin list tabs
- **Component:** `SearchInput.tsx:20-27`

**Description.** The live probe found unlabelled form fields on `/saved` (1), `/companies` (3) and `/requests` (1). `SearchInput` renders `<input type="search" placeholder={ph}>` with no `<label>`, no `aria-label`, no `aria-labelledby`.

**Why it is a problem.** Placeholder text is not a label: it disappears on input, is often skipped by screen readers, and fails WCAG 3.3.2 and 4.1.2. The decorative magnifier icon is correctly `pointer-events-none` but is not marked `aria-hidden`, so it may be announced as "search" — a second, confusing pseudo-label.

**Recommended solution.** Add `aria-label={ph}` to the input and `aria-hidden="true"` to the icon span. Where a visible label is appropriate (admin filters), render a real `<label>`.

**Expected improvement.** All search fields become identifiable; removes duplicate icon announcements.

---

### A11Y-09 — Filter and result changes are never announced

- **Severity:** 🟠 High · **Pages:** `/companies`, `/services`, `/services/:category`, `/saved`, all admin lists

**Description.** Changing a filter or typing a search silently swaps the result set. The count paragraph (`Companies.tsx:206`) has no `aria-live`. Nothing announces "24 companies" or "no results".

**Why it is a problem.** A screen-reader user cannot tell whether a filter did anything. WCAG 4.1.3 (Status Messages).

**Recommended solution.** Wrap the result count in `<p role="status" aria-live="polite" aria-atomic="true">`. Announce the loading state too ("Searching…").

**Expected improvement.** Filtering becomes usable non-visually; also helps low-vision users at high zoom.

---

### A11Y-10 — Colour is the sole indicator of navigation state

- **Severity:** 🟠 High · **Component:** `TopNav.tsx:101-108`, `BottomNav.tsx:27-29`

**Description.** Active nav items differ only by colour (`text-primary` vs `text-on-surface-variant`). The background tint that was meant to reinforce it (`bg-primary/8`) does not render — see **DS-01**. `BottomNav` uses `text-primary` vs `text-outline/70` plus a 10 % icon scale, which is not perceivable at 22 px.

**Why it is a problem.** WCAG 1.4.1 (Use of Colour). Colour-blind users and anyone on a washed-out screen cannot see where they are.

**Recommended solution.** Add a non-colour indicator: a filled icon (already computed via `fontVariationSettings` — extend it to the top nav), an underline/indicator bar, or the (fixed) background tint. React Router already sets `aria-current="page"` on `NavLink`; style `[aria-current="page"]` directly.

**Expected improvement.** Location is perceivable without colour on every page.

---

### A11Y-11 — Widespread touch targets under 44 px ✅ VERIFIED LIVE

- **Severity:** 🟠 High
- **Measured:** Home 18 sub-40 px targets at 390 px; `/companies` 22; `/requests` 23; `/requests` at 768 px 25

**Description.** Measured examples at 390 px:

| Control | Measured | Location |
|---|---|---|
| Footer links | 86 × **19** px | `Footer.tsx:148` |
| "All categories" link | 248 × **24** px | `Home.tsx:226` |
| `SaveButton` icon variant | **36 × 36** px | `SaveButton.tsx:48` — on every company card |
| `ConfirmDelete` (small) | ~**32 × 32** px | `confirm.tsx:19` |
| `ModalShell` close | **40 × 40** px | `ModalShell.tsx:7` |
| Language toggle | 60 × **32** px | `TopNav.tsx:178` |
| Admin row actions | ~**26** px tall | `admin/index.tsx:338-375` |
| `ActiveChip` remove `×` | ~**19 px** | `Companies.tsx:361` |

**Why it is a problem.** WCAG 2.5.8 requires 24 × 24 px minimum; Apple HIG and Material both specify 44/48 px. Several of these are below even the WCAG floor. The 19 px footer links and 19 px chip-remove buttons are effectively unhittable on a phone.

**Recommended solution.** Set a floor of 44 × 44 px for all interactive elements. Where the visual must stay small, expand the hit area with padding or an `::after` overlay rather than growing the glyph. Bump `SaveButton` to `w-11 h-11`. Give footer links `py-2`.

**Expected improvement.** Fewer mis-taps and rage-taps on the two highest-traffic mobile surfaces (cards and footer).

---

### A11Y-12 — Text below 12 px, including 9 px ✅ VERIFIED LIVE

- **Severity:** 🟠 High

**Description.** Live measurement found rendered text at **9 px**, **10 px** and **11 px**:

| Size | Content | Location |
|---|---|---|
| 9 px | Saved-count badge | `TopNav.tsx:239` |
| 10 px | Bottom-nav tab labels | `BottomNav.tsx:45` |
| 10 px | "Scroll down" cue | `Home.tsx:160` |
| 10 px | Badge counts | `PersonalTabs.tsx:40`, `Companies.tsx:192` |
| 11 px | Stat labels (uppercase, `tracking-[0.1em]`) | `Home.tsx:491` |
| 11 px | "Verified" pill | `Home.tsx:273` |
| 11 px | Sidebar badges | `SidebarBody.tsx:47-60` |

**Why it is a problem.** Below ~12 px, Arabic in Cairo becomes genuinely hard to read because the script relies on fine diacritics and connected forms — an 11 px uppercase-tracked Latin label and an 11 px Arabic label are not equivalent legibility. The **bottom-nav labels at 10 px are primary navigation**.

**Recommended solution.** Floor body/label text at 12 px and navigation labels at 11 px minimum; raise bottom-nav labels to 11–12 px and reduce icon size to compensate. Numeric badges may stay small if their information is duplicated in an `aria-label`.

**Expected improvement.** Legible primary navigation in both scripts; less strain for users over 40 and on high-DPI phones.

---

### A11Y-13 — Bottom-nav inactive labels fail contrast

- **Severity:** 🟠 High · **Component:** `BottomNav.tsx:29`

**Description.** Inactive tabs are `text-outline/70` — `#70787f` at 70 % over white ≈ `#a3a8ad`. Contrast against white ≈ **2.3:1**, at 10 px.

**Why it is a problem.** WCAG 1.4.3 requires 4.5:1 for text this size. Three of four primary navigation labels are below half the required ratio.

**Recommended solution.** Use full `text-outline` (`#70787f`, ≈ 4.6:1) or darker `text-on-surface-variant` (`#40484e`, ≈ 9:1) for inactive tabs. Never dilute an already-mid-tone token with an opacity modifier.

**Expected improvement.** Passing contrast on primary navigation.

---

### A11Y-14 — `outline/50`, `outline/60`, `outline/70` used for meaningful text

- **Severity:** 🟡 Medium
- **Component:** `Services.tsx:58`, `Companies.tsx:237`, `CompanyProfile.tsx:389`, `SearchInput.tsx:25` (`placeholder:text-outline/70`)

**Description.** The same anti-pattern as A11Y-13, applied to empty-state icons, placeholder text and the "self-reported" info glyph.

**Why it is a problem.** Placeholder text at ~2.3:1 is unreadable for many users. The `cursor-help` info icon at `outline/60` is both low-contrast and only discoverable by hover — it has no keyboard or touch equivalent.

**Recommended solution.** Placeholders at `#70787f` minimum. Replace `title=` tooltips with a real popover triggered by click/focus.

**Expected improvement.** Form hints and disclosure affordances become usable on touch and by keyboard.

---

### A11Y-15 — Heading hierarchy skips levels on every page ✅ VERIFIED LIVE

- **Severity:** 🟡 Medium · **Component:** `Footer.tsx:137`, plus page bodies

**Description.** Measured heading orders:

| Page | Order | Skip |
|---|---|---|
| `/` | `1 2 3 3 3 … 2 4 4 4` | 2 → 4 |
| `/companies` | `1 3 3 3 4 4 4` | **1 → 3** |
| `/start`, `/saved`, `/terms`, `/request`, 404 | `1 4 4 4` | **1 → 4** |

The `4`s are the footer's `<h4>` column titles (`Footer.tsx:137`), which appear on every page with no intervening `<h2>`/`<h3>`.

**Why it is a problem.** Screen-reader users navigate by heading level; a 1 → 4 jump implies missing structure. On `/companies` the company names are `<h3>` with no `<h2>` section heading above them.

**Recommended solution.** Footer columns become `<h2>` inside a `<nav aria-labelledby>` or a visually-hidden `<h2>Footer</h2>` wrapper. Give each public page a proper `<h2>` per section. Never choose a heading level for its default size — that is what the type tokens are for.

**Expected improvement.** Coherent document outline on every route; better SEO.

---

### A11Y-16 — Breadcrumbs are `<div>`s, not navigation landmarks

- **Severity:** 🟡 Medium · **Component:** `Services.tsx:38-42`, `Companies.tsx:126-130`, `ServiceCategory.tsx`

**Description.** Breadcrumbs render as a flex `div` with a `chevron_right` glyph between two links.

**Why it is a problem.** No `<nav aria-label="Breadcrumb">`, no `<ol>/<li>`, no `aria-current="page"` on the last crumb, and no `BreadcrumbList` structured data. The chevron glyph is announced as the word "chevron_right" by some screen readers because it is a text ligature with no `aria-hidden`.

**Recommended solution.** Use the standard `<nav aria-label="Breadcrumb"><ol><li>…` pattern, `aria-hidden="true"` on separators, `aria-current="page"` on the leaf, plus JSON-LD `BreadcrumbList`.

**Expected improvement.** Correct announcement, plus breadcrumb rich results in search.

---

### A11Y-17 — Material Symbols ligatures are read aloud

- **Severity:** 🟡 Medium · **Pages:** All · **Component:** every `<span className="material-symbols-outlined">`

**Description.** Icons are text nodes containing words like `arrow_forward`, `event_busy`, `receipt_long`. Almost none carry `aria-hidden="true"`.

**Why it is a problem.** Screen readers may announce "arrow underscore forward" mid-sentence. On the Companies card footer this reads as "View profile arrow forward". This is the single most common a11y defect in the codebase by instance count (hundreds of occurrences).

**Recommended solution.** Create an `<Icon name="…" />` wrapper that always emits `aria-hidden="true"` and `translate="no"`, and codemod every raw span to it. Pass a `label` prop where the icon is the only content.

**Expected improvement.** Removes hundreds of spurious announcements; centralises icon sizing at the same time.

---

### A11Y-18 — Charts convey data with no text alternative

- **Severity:** 🟠 High · **Pages:** Admin Overview, Provider Overview · **Component:** `Charts.tsx`

**Description.** SVG charts (bar, horizontal bar, donut, funnel) with no `role="img"`, no `<title>`/`<desc>`, no `aria-label`, and no accompanying data table.

**Why it is a problem.** The analytics content is entirely unavailable non-visually. Donut segments are distinguished by colour only (WCAG 1.4.1). Hardcoded hex fills (5 in this file) were never contrast-tested.

**Recommended solution.** Add `role="img"` with an `aria-label` summarising the series, plus a visually-hidden `<table>` of the same data. Add non-colour encoding (pattern or direct labels) to the donut.

**Expected improvement.** Analytics become auditable by every operator; also gives you copy-pasteable numbers.

---

### A11Y-19 — Toggle switches are div-based and mirror incorrectly

- **Severity:** 🟡 Medium · **Component:** `ProviderDashboard.tsx:615-617`, `AvailabilityControl.tsx:83`

**Description.** Switches are a hidden `peer` checkbox plus a styled div using `after:left-0.5` and `peer-checked:after:translate-x-4/5` — physical directions.

**Why it is a problem.** In Arabic the knob still sits on the left and travels right, so "on" reads as "moving backwards". There is also no `role="switch"`, so it announces as a checkbox with no on/off semantics, and the label association depends on DOM nesting that is not guaranteed.

**Recommended solution.** Use `start-0.5` and `rtl:peer-checked:after:-translate-x-4`, add `role="switch" aria-checked`, and bind an explicit `<label for>`.

**Expected improvement.** Switches read correctly in Arabic and announce their state.

---

### A11Y-20 — 22 images have no intrinsic dimensions ✅ VERIFIED LIVE

- **Severity:** 🟠 High → see **PERF-01**

---

## 5. 🔴 CRITICAL / 🟠 HIGH — RTL & Arabic

> Arabic is the **default** locale (`LocaleContext.tsx:20` defaults to `"ar"`, `index.html` ships `dir="rtl"`). Every RTL defect below is on the default path, not an edge case.

### RTL-01 — Admin and Provider drawers slide in from the wrong side ✅ VERIFIED

- **Severity:** 🔴 Critical
- **Pages:** `/admin`, `/provider` (mobile)
- **Component:** `admin/index.tsx:200`, `ProviderDashboard.tsx:267`

**Description.** Both render:

```jsx
<div className="drawer-left absolute top-0 left-0 h-full w-72 …">
```

`index.css:648-654` overrides the `.drawer-left` **animation** under `[dir="rtl"]` to `drawerRight` (`translateX(100%) → 0`), but the element is still **positioned** at `left: 0`. So in Arabic the drawer starts one panel-width to the *right* of the left edge — i.e. overlapping the middle of the screen — and slides *left* into the left edge. It ends up on the wrong side of an RTL layout.

`TopNav.tsx:257` gets this right: `left-0 rtl:left-auto rtl:right-0`. The two dashboards are hand-copies that missed it.

**Why it is a problem.** The primary navigation of both internal tools animates incorrectly and lands on the wrong edge in the default language. It reads as a rendering bug.

**Recommended solution.** Add `rtl:left-auto rtl:right-0` to both, exactly as `TopNav` does. Better: extract one `<Drawer>` component and delete the duplication (see **CODE-01**).

**Expected improvement.** Correct drawer placement and motion in Arabic on both dashboards.

---

### RTL-02 — `text-left` hardcoded on 11 interactive surfaces

- **Severity:** 🟠 High
- **Pages:** GuidedStart, Admin Leads / Reviews / Change Requests / Overview / Project Approvals, Provider Overview
- **Component:** `GuidedStart.tsx:79, 107`; `LeadsTab.tsx:37, 61, 94`; `ReviewsTab.tsx:183`; `ChangeRequestsTab.tsx:128`; `OverviewTab.tsx:154`; `ProjectApprovals.tsx:84`; `ProviderDashboard.tsx:304`

**Description.** `<button>` defaults to `text-align: center`, so these cards correctly add `text-left` — but `text-left` is physical. `LeadsTab.tsx:94` puts `text-left` on the `<tr>` of the **leads table header**.

**Why it is a problem.** In Arabic, every one of these cards and the whole leads table left-aligns its text while the surrounding layout is right-aligned. The two headline flows of both dashboards (choosing a category on GuidedStart, scanning leads) are visibly wrong in the default language.

**Recommended solution.** Replace all with `text-start`. Add an ESLint rule banning `text-left` / `text-right` / `ml-*` / `mr-*` / `pl-*` / `pr-*` in JSX.

**Expected improvement.** Correct reading alignment across the admin leads table and both card-list flows.

---

### RTL-03 — `ml-auto` used where `ms-auto` is meant, 8 times

- **Severity:** 🟠 High
- **Component:** `ProviderDashboard.tsx:291, 431, 1018`; `admin/index.tsx:269`; `TeamTab.tsx:268`; `CompanyEditor.tsx:260`; `ReviewsTab.tsx:248`; `Charts.tsx:285`

**Description.** `ml-auto` pushes an element to the physical right regardless of direction. In RTL that is the *start* side, so the element jumps to the wrong end.

`SidebarBody.tsx:47` correctly uses `ms-auto`. `ProviderDashboard.tsx:1018` — the same badge in the near-identical provider sidebar — uses `ml-auto`. The two sidebars have diverged.

**Why it is a problem.** Sign-out buttons, result counts, badge counters, review dates and chart values all land on the wrong side in Arabic. In `ProviderDashboard.tsx:291` the sign-out button collides with the page title.

**Recommended solution.** Global replace `ml-auto` → `ms-auto`, `mr-auto` → `me-auto`.

**Expected improvement.** Toolbars, badges and counters align to the correct edge in both languages.

---

### RTL-04 — Physical margins and paddings throughout

- **Severity:** 🟠 High
- **Component:** `TopNav.tsx:198` (`-ml-1`), `admin/index.tsx:212` (`-ml-1`), `ProviderDashboard.tsx:281` (`-ml-1`), `MyRequests.tsx:384` (`-mr-1.5`), `ModalShell.tsx:18` (`ml-0.5`), `Charts.tsx:212` (`pr-2`), `Charts.tsx:312` (`ml-1.5`), `ReviewsTab.tsx:266` (`ml-1`), `CompanyEditor.tsx:105` (`ml-1`)

**Description.** Optical-alignment nudges applied in physical directions.

**Why it is a problem.** In Arabic the hamburger nudges *away* from the edge instead of toward it, so it sits ~8 px further from the screen edge than intended, breaking the optical alignment with the content below. The required-field asterisk in `LField` attaches to the wrong side of its label.

**Recommended solution.** `-ms-1`, `-me-1.5`, `ms-0.5`, `pe-2`, `ms-1.5`.

**Expected improvement.** Optical alignment holds in both directions.

---

### RTL-05 — Provider sidebar active marker is physically positioned

- **Severity:** 🟠 High · **Component:** `ProviderDashboard.tsx:1014`

**Description.**

```jsx
{active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
```

versus the admin equivalent at `SidebarBody.tsx:43`, which correctly uses `start-0` and `rounded-e-full` — and carries a comment explaining exactly why.

**Why it is a problem.** In Arabic the provider rail sits on the right; its active marker detaches to the far left of the tab, floating over the content area. The fix was already made once in the admin file and never propagated.

**Recommended solution.** `start-0` + `rounded-e-full`. Then extract one shared `<SidebarNav>` (see **CODE-01**).

**Expected improvement.** The active tab indicator attaches to its tab in Arabic.

---

### RTL-06 — Native `<select>` arrow overlaps text in Arabic

- **Severity:** 🟠 High · **Component:** `index.css:515-520`
- **Pages:** `/companies` (rating, sort), all admin filter tabs, every form using `select.field-input`

**Description.**

```css
select.field-input {
  background-position: right 14px center;
  padding-right: 44px;
}
```

Both properties are physical.

**Why it is a problem.** In RTL, text starts at the right edge — exactly where the chevron is drawn — and the 44 px of clearance is reserved on the left where nothing needs it. Long option labels (company names in the admin lead filter) run underneath the arrow.

**Recommended solution.** Use logical properties with a direction-aware background position:

```css
select.field-input { padding-inline-end: 44px; background-position: right 14px center; }
[dir="rtl"] select.field-input { background-position: left 14px center; }
```

**Expected improvement.** Legible selects in Arabic across the public filters and the entire admin console.

---

### RTL-07 — Home "featured projects" captions pinned to the physical left

- **Severity:** 🟡 Medium · **Component:** `Home.tsx:327, 341, 355`

**Description.** `absolute bottom-0 left-0 p-6` on all three project-card caption blocks.

**Why it is a problem.** In Arabic the captions sit bottom-left of a right-to-left page, opposite to every other card in the app (the Services cards at `Services.tsx:89` correctly use `left-4 rtl:left-auto rtl:right-4`).

**Recommended solution.** `bottom-0 start-0` (Tailwind logical inset utilities), or match the `rtl:` pattern already used on the Services cards.

**Expected improvement.** Consistent caption anchoring across every image card.

---

### RTL-08 — Saved-count badge positioned physically

- **Severity:** 🟡 Medium · **Component:** `TopNav.tsx:161, 239`, `BottomNav.tsx:41`, `Companies.tsx:192`

**Description.** `-top-0.5 -right-0.5` and `right-[calc(50%-14px)]`.

**Why it is a problem.** Badge convention mirrors with direction; in RTL these all sit on the same physical side, so the badge overlaps the icon's leading edge instead of its trailing edge. On the mobile top bar the badge partially covers the heart glyph.

**Recommended solution.** `-top-0.5 -end-0.5`, and `end-[calc(50%-14px)]`.

**Expected improvement.** Correctly-anchored badges in both directions.

---

### RTL-09 — `group-hover:translate-x-1` never mirrored (except once)

- **Severity:** 🟡 Medium
- **Component:** `Services.tsx:106`, `Companies.tsx:411`, `Home.tsx:296`

**Description.** "Explore →" and "View profile →" arrows slide `+x` on hover. `Home.tsx:147` is the one place that adds `rtl:group-hover:-translate-x-1`; nowhere else does.

**Why it is a problem.** In Arabic the arrow icon is correctly mirrored by `.rtl-flip` but then slides *backwards* on hover — the motion contradicts the glyph.

**Recommended solution.** Add the `rtl:` counterpart everywhere, or define a `.hover-nudge-forward` utility that reads direction once.

**Expected improvement.** Coherent directional motion in Arabic.

---

### RTL-10 — Arabic headings fall back to a system font

- **Severity:** 🟠 High
- **Component:** `index.css:643-645`, `tailwind.config.js:81-94`

**Description.** `[dir="rtl"] body { font-family: "Cairo", sans-serif; }` sets the Arabic body font. But every heading in the app carries an explicit Tailwind font class — `font-display`, `font-headline-lg`, `font-headline-md`, `font-label-md` — all of which resolve to **Plus Jakarta Sans**, which has **no Arabic glyphs**. Those elements have higher specificity than the `body` rule, so Arabic headings render in the browser's generic `sans-serif` fallback (Segoe UI / Tahoma on Windows, Geeza Pro on macOS).

`index.html:24` also loads **Alexandria** (5 weights, an Arabic-capable family) which appears nowhere in the config or the codebase — dead weight on every page load.

**Why it is a problem.** Every Arabic heading in the product is set in a different, unchosen typeface than the body — and a different one on each operating system. This is the largest single reason the Arabic UI does not feel designed, and it is invisible to anyone testing in English.

**Recommended solution.** Define the font stacks direction-aware:

```js
display: ['Plus Jakarta Sans', 'Cairo', 'sans-serif'],
sans:    ['Inter', 'Cairo', 'sans-serif'],
```

Latin glyphs resolve from the first family, Arabic falls through to Cairo. Then either use Alexandria deliberately for Arabic display type or drop it from the font request (saves ~5 font files).

**Expected improvement.** Consistent, intentional Arabic typography on every heading; one less webfont download.

---

### RTL-11 — `capitalize` on the admin page title

- **Severity:** 🔵 Low · **Component:** `admin/index.tsx:218`

**Description.** `className="… capitalize"` on the `<h1>`.

**Why it is a problem.** No-op in Arabic (no case), and in English it fights the translated strings — if a translator writes "site status" it becomes "Site Status", but "Reviews & feedback" becomes "Reviews & Feedback". Capitalisation belongs in the translation file, not in CSS.

**Recommended solution.** Remove `capitalize`; capitalise in `lib/i18n`.

**Expected improvement.** Translators control their own copy.

---

### RTL-12 — Literal "←" character used as a back arrow

- **Severity:** 🔵 Low · **Component:** `ProviderDashboard.tsx:211`

**Description.** `<Link>← {t(locale,"prov_back_to_site")}</Link>`

**Why it is a problem.** A literal `←` does not mirror under `dir="rtl"`, so it points the wrong way in Arabic. Every other back affordance in the app uses `<span className="material-symbols-outlined rtl-flip">arrow_back</span>`.

**Recommended solution.** Use the icon with `rtl-flip`.

---

### RTL-13 — Sidebar "Back to site" arrow not mirrored

- **Severity:** 🔵 Low · **Component:** `SidebarBody.tsx:68`

**Description.** `<span className="material-symbols-outlined text-[18px]">arrow_back</span>` — no `rtl-flip`, unlike the ~20 other directional icons in the codebase which have it.

**Recommended solution.** Add `rtl-flip`.

---

### RTL-14 — `.rtl-flip` is defined twice, identically

- **Severity:** 🔵 Low · **Component:** `index.css:635-637` and `657-659`

**Description.** The exact same rule appears twice, ~20 lines apart, each with its own explanatory comment block.

**Recommended solution.** Delete the duplicate.

---

## 6. 🟠 HIGH — Navigation & layout structure

### NAV-01 — Seven different top offsets for one fixed header ✅ VERIFIED

- **Severity:** 🟠 High · **Pages:** every public page

**Description.** `TopNav` is `position: fixed`, 64 px tall on mobile and 76 px on desktop. `<main>` in `RootLayout.tsx:79` adds no top padding, so each page compensates on its own:

| Page | Class | Mobile clearance | Desktop clearance |
|---|---|---|---|
| Services, ServiceCategory | `pt-28` | 112 − 64 = **48 px** | 112 − 76 = **36 px** |
| Companies | `pt-24 md:pt-28` | **32 px** | **36 px** |
| LegalPage | `pt-24` | **32 px** | **20 px** |
| GuidedStart, MyRequests, Saved, Messages | `pt-20 md:pt-24` | **16 px** | **20 px** |
| RequestForm, NotFound | `pt-20` | **16 px** | **4 px** |
| Home | `mt-16 md:mt-20` on hero content | — | — |

**Why it is a problem.** The gap between the header and the first heading changes on every navigation — 48 px, then 32, then 16. It reads as the page shifting. On **RequestForm** — the conversion page — and the 404, desktop content clears the header by **4 px**, so the H1 nearly touches the frosted nav. If the header ever changes height, seven files break.

**Recommended solution.** Put the offset in one place: `<main className="pt-16 md:pt-[76px]">` in `RootLayout`, or define `--nav-h` as a CSS variable and use `pt-[calc(var(--nav-h)+2rem)]`. Delete all seven per-page paddings.

**Expected improvement.** Identical, correct header clearance on every route; header height becomes a one-line change.

---

### NAV-02 — Sticky filter bar leaves a 4 px gap under the mobile header

- **Severity:** 🟡 Medium · **Page:** `/companies` · **Component:** `Companies.tsx:142`

**Description.** `sticky top-[60px] md:top-[76px]`. The mobile header is **64 px**, not 60.

**Why it is a problem.** While scrolling, a 4 px strip of page content is visible between the frosted header and the sticky filter bar — content slides through a hairline gap. Desktop is correct at 76 px, which makes the mobile value look like a typo.

**Recommended solution.** Derive from the same `--nav-h` variable as NAV-01.

---

### NAV-03 — No account, sign-in or profile entry point on the public site

- **Severity:** 🟠 High · **Pages:** All public · **Component:** `TopNav`, `BottomNav`, `Footer`

**Description.** There is no route, link or UI anywhere on the public site for signing in, registering, or managing an account. `AuthGate` protects `/admin` and `/provider`, but there is no way to reach a login form except by typing a protected URL.

**Why it is a problem.** Providers and admins have no discoverable entry to their own dashboards — they must know a URL. Customers have no identity at all, which is why `/requests` and `/messages` rely on locally-stored claim tokens: clearing browser data loses a customer's entire request history with no recovery path. That is a significant trust and retention problem for a lead-gen product.

**Recommended solution.** Short term: add a "Sign in" link in the footer and the mobile drawer, routing to a real login page. Medium term: give customers a lightweight identity (phone + OTP) so requests and messages survive a device change.

**Expected improvement.** Providers self-serve; customers stop losing their history; support load drops.

---

### NAV-04 — `BottomNav` omits Messages, contradicting `PersonalTabs`

- **Severity:** 🟡 Medium · **Component:** `BottomNav.tsx:6-11` vs `PersonalTabs.tsx:20-24`

**Description.** The mobile tab bar exposes Home / Services / Saved / Requests. The personal-area segmented control exposes Saved / Requests / **Messages**. Messages carries an unread badge and is the only real-time surface in the product, yet it is absent from primary mobile navigation.

**Why it is a problem.** A customer with an unread reply from a provider has no way to discover it from the mobile home screen. The unread badge exists but is on a control the user has to already be in the personal area to see.

**Recommended solution.** Either promote Messages into the bottom bar (replacing Services, which is reachable from Home) or surface the aggregate unread count on the Requests tab.

**Expected improvement.** Unread provider replies become discoverable — directly affects lead conversion.

---

### NAV-05 — `BottomNav` `aria-label` is wrong

- **Severity:** 🔵 Low · **Component:** `BottomNav.tsx:18`

**Description.** `aria-label={t(locale, "nav_more")}` — the primary mobile navigation announces itself as "More".

**Recommended solution.** Use a dedicated `nav_primary` / `nav_main` key.

---

### NAV-06 — Admin and Provider tab state is not in the URL

- **Severity:** 🟠 High · **Pages:** `/admin`, `/provider` · **Component:** `admin/index.tsx:56-59`, `ProviderDashboard.tsx`

**Description.** `?tab=` is read **once** on mount, then tab state lives in `useState`. The URL never updates as the operator moves between tabs.

**Why it is a problem.**

- The browser **Back button leaves the dashboard entirely** instead of returning to the previous tab. This is the single most common complaint pattern for tabbed admin tools.
- A tab cannot be bookmarked or shared ("look at the Change Requests queue" is not a link).
- Refreshing always lands on Overview, losing the operator's place mid-task.
- Deep links from push notifications work only on the very first load.

**Recommended solution.** Use real nested routes (`/admin/leads`, `/admin/companies`, …) with `<Outlet />`, or at minimum `setSearchParams({tab})` on every change. Nested routes additionally enable per-tab code splitting (see **PERF-05**).

**Expected improvement.** Back button behaves; tabs become linkable; refresh preserves context. Large day-to-day quality-of-life gain for operators.

---

### NAV-07 — Footer and drawer hash links are broken from every non-Home route

- **Severity:** 🟠 High · **Component:** `Footer.tsx:15-18`, `TopNav.tsx:26-30`

**Description.** `/#about`, `/#reviews`, `/#contact` are used in the footer (on every page) and the mobile drawer. React Router's `<Link>` does not scroll to a hash by default, and `RootLayout` mounts `<ScrollRestoration />` which restores scroll position on navigation.

**Why it is a problem.** From `/companies`, clicking "Contact" navigates to Home and lands at the top, or at a restored scroll offset — never at `#contact`. Since **there is no Contact page** (see §1.2), the only contact affordance in the product does not work from 12 of 13 routes.

**Recommended solution.** Add a `ScrollToHash` effect in `RootLayout` that reads `location.hash` and calls `scrollIntoView` after paint, or give About/Contact real routes. Real routes are better — they are linkable, indexable, and were on your original checklist.

**Expected improvement.** Contact and About become reachable; likely a direct lift in inbound enquiries.

---

### NAV-08 — Two footer links point at the same anchor with different labels

- **Severity:** 🔵 Low · **Component:** `Footer.tsx:15, 17`

**Description.** `footer_link_why → /#about` and `footer_link_how_it_works → /#about`.

**Why it is a problem.** Two differently-labelled links with identical destinations is a WCAG 2.4.4 concern and reads as filler.

**Recommended solution.** Give "How it works" its own section/route, or remove it.

---

### NAV-09 — Footer copyright rendered twice on every page

- **Severity:** 🔵 Low · **Component:** `Footer.tsx:49` and `108`

**Description.** `t(locale, "footer_copyright")` appears in the brand blurb *and* in the bottom bar, next to a hardcoded `© {year} Al Assema.`

**Why it is a problem.** The same sentence twice, ~400 px apart. The bottom row is `flex justify-between` with a single child, so the `justify-between` has no effect — evidence something was removed and not cleaned up.

**Recommended solution.** Brand blurb gets a real tagline; bottom row keeps the copyright plus legal links and the language switcher.

---

### NAV-10 — Language switcher is buried

- **Severity:** 🟡 Medium · **Component:** `TopNav.tsx:176-185`, `TopNav.tsx:330-338`

**Description.** On desktop it is a 60 × 32 px bordered pill at the far end of the icon row. On mobile it is **not in the top bar at all** — it is at the very bottom of the drawer, below the primary CTA, right-aligned in an otherwise empty row.

**Why it is a problem.** For a bilingual product in a bilingual market this is a primary control. A mobile user who lands in the wrong language must find and open the hamburger, scroll the drawer, and locate a small text button. The button is also below the 44 px target minimum.

**Recommended solution.** Promote to the mobile top bar (a compact `ع / EN` toggle), enlarge to 44 px, and add `lang="ar"` / `lang="en"` to the respective labels so screen readers pronounce them correctly.

**Expected improvement.** Fewer users stuck in the wrong language on their first session.

---

### NAV-11 — Desktop nav exposes only 2 of 6 destinations

- **Severity:** 🟡 Medium · **Component:** `TopNav.tsx:9-12` vs `14-30`

**Description.** Desktop shows Services and Companies. The mobile drawer additionally offers Home, Find a match (`/start`), Saved, Requests, Reviews, About, Contact.

**Why it is a problem.** `/start` — the guided finder, arguably the highest-intent entry point in the product — is invisible on desktop except via the mobile drawer. Desktop and mobile expose different information architectures.

**Recommended solution.** Add "Find a match" to the desktop nav; align the two menus.

**Expected improvement.** Surfaces the highest-converting flow to desktop traffic.

---

### NAV-12 — `<main>` has no landmark id and there is no `<header>`/`<nav>` structure on dashboards

- **Severity:** 🟡 Medium · **Component:** `admin/index.tsx:209`, `ProviderDashboard.tsx:279`

**Description.** The dashboard top bars are plain `<div>`s, not `<header>`. The desktop sidebar is `<aside>` (correct), but contains a `<nav>` with no `aria-label`, so a screen reader hears two unnamed navigation landmarks.

**Recommended solution.** `<header>` for top bars, `aria-label` on each `<nav>`, `id="main"` on `<main>`.

---

## 7. 🟠 HIGH — Responsive behaviour

### RESP-01 — Three pages scroll horizontally at 390 px, in both languages ✅ VERIFIED LIVE

- **Severity:** 🟠 High
- **Pages:** `/saved`, `/requests`, `/messages`
- **Component:** `PersonalTabs.tsx:27`

**Description.** Measured `document.scrollWidth`:

| Page | Locale | Viewport | scrollWidth | Overflow |
|---|---|---|---|---|
| `/saved` | ar | 390 | **414** | 24 px |
| `/saved` | en | 390 | **424** | 34 px |
| `/requests` | ar | 390 | **414** | 24 px |
| `/messages` | ar | 390 | **414** | 24 px |

Root cause:

```jsx
<div className="inline-flex bg-surface-container rounded-2xl p-1 mb-7">
```

Three tabs (icon + label + count badge) at `px-4 py-2` inside an `inline-flex` with no `max-width`, no `overflow-x-auto` and no wrap. The English labels are longer, hence the worse overflow in LTR.

**Why it is a problem.** The whole page scrolls sideways. On `/requests` the status filter chips are pushed fully off-screen (measured at `left: -143px` to `-79px` — entirely outside the viewport and unreachable without horizontal scroll). Horizontal scroll on a phone is one of the most reliable signals of an unfinished build.

**Recommended solution.** Give the container `flex max-w-full overflow-x-auto scrollbar-hide` (the pattern already used correctly for the category chips at `Companies.tsx:177`), or collapse to icon-only tabs below `sm`. Add a Playwright assertion — `expect(scrollWidth).toBeLessThanOrEqual(clientWidth)` — across all routes × 3 viewports × 2 locales; you already have `@playwright/test` installed.

**Expected improvement.** Removes horizontal scroll from the three personal-area pages and makes the status filters reachable.

---

### RESP-02 — Tablet (768–1023 px) is an unowned breakpoint

- **Severity:** 🟡 Medium · **Pages:** most

**Description.** The app is essentially two designs — `<md` and `≥md` — with `sm:` and `lg:` used sparingly and inconsistently.

At 768 px:
- `/companies` jumps straight from a 1-column to a 2-column grid (`md:grid-cols-2`) but the filter bar switches to the full desktop inline layout with all category chips + two selects, which wraps to three rows.
- `/services` uses `sm:grid-cols-2 lg:grid-cols-3` — so 768 px gets 2 columns.
- Home services/companies rails switch from horizontal scroll to `md:grid-cols-3` — three 240 px cards in a 768 px container, cramped.
- `CompanyProfile` sidebar only appears at `lg:` (1024 px), so the whole 768–1023 px range gets a single stacked column with a very long scroll.
- Admin sidebar appears at `md:` (768 px) — a 256 px fixed rail leaves 512 px for two-column card grids (`lg:grid-cols-2` saves it, but the lead table at `md:block` renders a 6-column table in 512 px).

**Why it is a problem.** iPad portrait is a real share of traffic for a directory product. The admin leads table is the worst case — measured 25 sub-40 px touch targets at 768 px.

**Recommended solution.** Treat `md` as tablet explicitly: keep the mobile filter sheet until `lg`, keep the mobile lead cards until `lg`, and introduce `sm:` two-column layouts so the jump is 1 → 2 → 3 rather than 1 → 3.

**Expected improvement.** iPad stops being a degraded desktop.

---

### RESP-03 — Hero is `h-screen` with `min-h-[640px]`

- **Severity:** 🟡 Medium · **Page:** `/` · **Component:** `Home.tsx:72`

**Description.** `h-screen min-h-[640px] max-h-[900px]`.

**Why it is a problem.** `100vh` on iOS Safari refers to the *largest* viewport (URL bar retracted), so the hero is taller than the visible area on first paint and the scroll cue at `bottom-8` is below the fold — the exact element meant to signal scrollability. On a 640 px-tall landscape phone, `min-h-[640px]` forces the hero to exceed the viewport entirely.

**Recommended solution.** Use `h-[100svh]` with a `h-screen` fallback, and drop `min-h` below ~560 px or disable it in landscape.

**Expected improvement.** Scroll cue visible on first paint on iOS; hero fits landscape phones.

---

### RESP-04 — Horizontal card rails have no scroll affordance

- **Severity:** 🟡 Medium · **Page:** `/` · **Component:** `Home.tsx:196, 243`, `index.css:366-380`

**Description.** `.mobile-scroll` sets `scrollbar-width: none` and hides the WebKit scrollbar. Cards are `w-[240px]` / `w-[275px]` in a 390 px viewport, so the second card is cut mid-width — which is the only cue that more content exists.

**Why it is a problem.** No scrollbar, no edge fade, no arrows, no dot indicators. Users who do not notice the peek-through never see categories 2–6. The reviews marquee at `index.css:406` *does* have a mask-image edge fade — the pattern exists and was not applied here.

**Recommended solution.** Add the same mask-image edge fade, plus dot indicators or desktop arrow buttons. Never fully hide a scrollbar without replacing the affordance.

**Expected improvement.** Category and company discovery on mobile stops depending on a visual accident.

---

### RESP-05 — Category chip rail on `/companies` has the same problem

- **Severity:** 🔵 Low · **Component:** `Companies.tsx:177`

**Description.** `overflow-x-auto scrollbar-hide` on the mobile category chips, with the "Filters" button pinned beside it. Same missing affordance.

---

### RESP-06 — Provider dashboard uses flat `p-6` on mobile

- **Severity:** 🔵 Low · **Component:** `ProviderDashboard.tsx:297` vs `admin/index.tsx:242`

**Description.** Admin: `p-4 md:p-6`. Provider: `p-6`.

**Why it is a problem.** At 390 px the provider content area loses 48 px of horizontal space compared to admin — noticeable on tables and forms, and the two tools look mismatched.

---

### RESP-07 — Company cards fix a `275px` width on mobile

- **Severity:** 🔵 Low · **Component:** `Home.tsx:252`

**Description.** `w-[275px] flex-shrink-0 md:w-auto` inside `.mobile-scroll` at 16 px page margins.

**Why it is a problem.** On a 320 px device (iPhone SE 1st gen, still in the long tail) 275 px + 32 px margins = 307 px, leaving a 13 px peek — nearly invisible. On a 430 px Pro Max the peek is 123 px, an awkward half-card.

**Recommended solution.** `w-[78vw] max-w-[300px]` so the peek is proportional.

---

## 8. 🟠 HIGH — Typography

### TYPO-01 — 1,097 hardcoded font sizes across 56 files

- **Severity:** 🟠 High · **Pages:** all

**Description.** Counted by static analysis: `text-[NNpx]` occurs **1,097** times in 56 files. Worst offenders: `CompanyProfile.tsx` (79), `ProviderDashboard.tsx` (69), `Home.tsx` (64), `OfferingsEditor.tsx` (52), `MyRequests.tsx` (51), `LeadsTab.tsx` (45), `RequestForm.tsx` (44), `ReviewsTab.tsx` (44), `Companies.tsx` (41).

Measured on the live Home page: **13 distinct font sizes** (10, 11, 12, 13, 14, 15, 17, 18, 20, 24, 36, 48, 60 px), **6 weights** (400, 500, 600, 700, 800, 900) and **22 distinct computed line-heights**.

**Why it is a problem.** There is no type scale. 13 px and 14 px are used interchangeably for the same role (card meta text) across adjacent components. Six weights on one page is roughly double what a disciplined system uses. Because sizes are per-element, Arabic — which needs slightly more leading than Latin at the same size — cannot be tuned globally.

**Recommended solution.** Codemod to the existing tokens, extended to 7 steps. Add `no-restricted-syntax` ESLint rules for `text-[…px]` and `font-[…]`.

**Expected improvement.** A visibly steadier page; one-line global type adjustments; Arabic leading becomes tunable.

---

### TYPO-02 — Conflicting utility classes on the same element

- **Severity:** 🟡 Medium
- **Component:** `Footer.tsx:45, 48, 137, 150`, `Services.tsx:99`, `CompanyProfile.tsx` (several)

**Description.** Elements carry a size token and a raw size at once, so the later class silently wins:

```jsx
<p className="text-body-md font-body-md text-outline-variant leading-relaxed text-sm">   // 16px → 14px
<h4 className="text-label-md font-label-md … text-xs">                                    // 14px → 12px
<Link className="text-headline-md font-headline-md font-black …">                         // token weight 600 → 900
```

**Why it is a problem.** Reading the code, the token appears to be in use; in the browser it is overridden. Anyone tuning `body-md` will see no effect and conclude the token system is broken. Overriding the token's bundled `fontWeight` with `font-black` also discards the token's `letterSpacing`.

**Recommended solution.** Remove the redundant class in each case; pick either the token or the raw value.

---

### TYPO-03 — `font-*` classes used as families, not weights

- **Severity:** 🔵 Low · **Component:** `tailwind.config.js:81-94`

**Description.** `font-body-md`, `font-label-sm`, `font-headline-lg` etc. are registered under `fontFamily`, so they emit `font-family`, not weight — and they all resolve to the same two families. `font-body-md` is therefore a no-op alias for `font-sans`.

**Why it is a problem.** Nine near-identical entries in `fontFamily` create the illusion of nine typefaces. Every `text-X font-X` pair in the codebase is half-redundant.

**Recommended solution.** Keep two families (`display`, `sans`). Delete the seven aliases. The `fontSize` tokens already carry weight.

---

### TYPO-04 — Uppercase + wide tracking applied to translated strings

- **Severity:** 🟡 Medium
- **Component:** `Home.tsx:160, 491`, `Footer.tsx:137`, `TopNav.tsx:290, 305`, `CompanyProfile.tsx:361, 374`, `Companies.tsx:282, 294, 309`

**Description.** `uppercase tracking-wider` / `tracking-[0.1em]` / `tracking-widest` on section labels and stat captions.

**Why it is a problem.** `text-transform: uppercase` does nothing in Arabic, and **letter-spacing actively breaks Arabic**: it separates letters that must remain connected, producing broken-looking words (تـ ـقـ ـيـ ـيـ ـم). At 11 px this is the worst case in the app. Measured: `11px, tracking 0.1em, uppercase` on the Home stat labels — which are Arabic by default.

**Recommended solution.** Guard with `ltr:uppercase ltr:tracking-wider`, or better, drop the treatment and rely on weight and colour for label hierarchy.

**Expected improvement.** Arabic labels render as connected words instead of fragments. High-visibility fix directly under the hero.

---

### TYPO-05 — `line-clamp` without a fallback height

- **Severity:** 🔵 Low · **Component:** `Home.tsx:293, 444`, `Companies.tsx:408`, `admin/index.tsx:412`

**Description.** `line-clamp-2` / `line-clamp-5` truncate but no `min-height` reserves the space.

**Why it is a problem.** Cards whose tagline is one line are shorter than neighbours in the same grid row, so the footer rows (`{n} projects · View profile →`) sit at different heights across a row. Visible on `/companies` at every breakpoint.

**Recommended solution.** Pair each clamp with a matching `min-h` (`min-h-[2.75rem]` for 2 lines at 14 px/1.6).

---

## 9. 🟠 HIGH — Components

### CMP-01 — Skeleton does not match the component it replaces

- **Severity:** 🟡 Medium · **Component:** `Skeleton.tsx:7-28` vs `Companies.tsx:369-419`

**Description.** `CompanyCardSkeleton` renders: cover, then a 40 px avatar beside two text bars, two full-width bars, and **two 96 × 32 px button blocks**. The real `CompanyCard` has: cover with an overlapping 56 px logo and a save button, `pt-9`, a title row with a verified glyph, a category line, a stars row, a 2-line tagline, and a bordered footer — **and no buttons at all**.

**Why it is a problem.** The skeleton is measurably a different height and shape from the content, so the grid visibly jumps when data lands. That is precisely the layout shift skeletons exist to prevent.

**Recommended solution.** Derive the skeleton from the card's own layout (share a wrapper), or hand-match the geometry. Add a visual regression test that overlays both.

---

### CMP-02 — Loading states rendered as empty states

- **Severity:** 🟠 High · **Pages:** all admin tabs · **Component:** `admin/index.tsx:276, 309, 398`

**Description.**

```jsx
<EmptyState msg={t(locale, loading ? "admin_searching" : "admin_leads_none")} icon="search_off" />
```

Loading and "no results" share one component. During a search the operator sees a large `search_off` (crossed-out magnifier) icon with the text "Searching…".

**Why it is a problem.** The iconography says "nothing found" while the copy says "still looking". For the ~300 ms debounce plus network time on every keystroke pause, the admin sees a failure-shaped screen. There is no skeleton anywhere in the admin console.

**Recommended solution.** Separate `<Loading>` (skeleton rows matching the table/grid) from `<Empty>` (icon + explanation + primary action).

**Expected improvement.** Search stops looking like it failed.

---

### CMP-03 — Refetches show no loading feedback at all

- **Severity:** 🟠 High · **Pages:** `/companies`, all admin/provider lists

**Description.** `loadingEmpty` is `loading && data.length === 0`. Once results exist, `companySearch.loading` is never surfaced — no spinner, no dimming, no `aria-busy`.

**Why it is a problem.** Changing a filter shows the **previous** result set, unchanged, for the duration of the request. On a slow connection the user clicks a filter, sees nothing happen, and clicks again. There is no indication the app is working. This is the most common source of "the filter is broken" reports.

**Recommended solution.** Apply `opacity-60 pointer-events-none` + `aria-busy="true"` to the results region while `loading` is true, or show a thin top progress bar. `ScrollProgress` already provides a bar component to model it on.

**Expected improvement.** Filtering feels responsive; eliminates double-submits.

---

### CMP-04 — `EmptyState` offers no path forward

- **Severity:** 🟡 Medium · **Component:** `admin/components/EmptyState.tsx`

**Description.** Icon + one line of text. No heading, no explanation, no action.

**Why it is a problem.** Empty states are the highest-value teaching moment in an admin tool. "No companies" should offer "Add your first company" — the button exists in the top bar but is not connected to the empty state. Compare Linear or Notion, where every empty state has a primary action.

**Recommended solution.** Extend to `{ icon, title, body, action }` and pass the relevant action at each call site.

---

### CMP-05 — Three separate empty-state implementations

- **Severity:** 🟡 Medium
- **Component:** `admin/components/EmptyState.tsx`; `Companies.tsx:236-243`; `Services.tsx:57-60`; plus one-off blocks in `Saved.tsx:43`, `MyRequests.tsx:101`, `Messages.tsx:228`, `NotFound.tsx:12`, `OverviewTab.tsx:83`, `CatalogError.tsx:13`

**Description.** The `w-16 h-16 rounded-full bg-{color}/8 flex items-center justify-center mx-auto mb-4` circle-with-icon pattern is hand-written in **six** places (and all six use the non-generating `/8` opacity — see **DS-01**, so all six circles are invisible).

**Why it is a problem.** Six copies, six chances to diverge, and one shared bug affecting all of them.

**Recommended solution.** One `<EmptyState>` used everywhere, public and admin.

---

### CMP-06 — `ModalShell` is not used by the public site

- **Severity:** 🟡 Medium
- **Component:** `ModalShell.tsx` vs `Home.tsx:560-629`, `MyRequests.tsx:371`, `CompanyProfile.tsx:553, 689, 858`

**Description.** Five public dialogs each hand-roll their own overlay, panel, header, close button and padding. They differ in backdrop opacity (`/45` vs `/40`), z-index (`50`, `60`, `80`, `100`), radius (`rounded-2xl` vs `rounded-t-3xl`), and mobile behaviour (centred vs bottom-sheet vs full-screen).

**Why it is a problem.** Five modals that behave differently in the same product. Also five places to fix the a11y issues in **A11Y-01/02** instead of one.

**Recommended solution.** One `<Modal>` with `variant="center" | "sheet" | "fullscreen"`, correct a11y built in, used by both public and admin.

---

### CMP-07 — Two hand-copied sidebar components

- **Severity:** 🟠 High → see **CODE-01**

---

### CMP-08 — `Pagination` is missing and inconsistent

- **Severity:** 🟡 Medium · **Component:** `Pagination.tsx`, `Companies.tsx:251`

**Description.** Pagination renders only when `isApiConfigured()`. In demo mode `/companies` renders the entire catalogue with no pager. There are no page numbers (only Prev / `3 / 12` / Next), no jump-to-page, no page-size control, no `<nav>` landmark, no `aria-live` on the range text, and the `1–20 of 312` label is not tied to the buttons.

**Why it is a problem.** With 12+ pages, Prev/Next only is a poor experience. Screen readers get no announcement when the page changes — the list silently swaps.

**Recommended solution.** Wrap in `<nav aria-label="Pagination">`, add page-number buttons with `aria-current="page"`, announce the new range via `aria-live="polite"`, and move focus to the results heading on page change.

---

### CMP-09 — Bottom sheet has a drag handle but is not draggable

- **Severity:** 🟡 Medium · **Component:** `Companies.tsx:273`

**Description.** `<div className="w-10 h-1 bg-outline-variant/40 rounded-full mx-auto mb-5" />` — the universal iOS "drag to dismiss" affordance. There is no drag handler.

**Why it is a problem.** Users who learned the gesture from every native app will drag, nothing will happen, and the sheet will feel broken. A false affordance is worse than none.

**Recommended solution.** Implement drag-to-dismiss (pointer events + a translate + a velocity threshold), or remove the handle.

---

### CMP-10 — Tabs are not tabs

- **Severity:** 🟡 Medium · **Component:** `CompanyProfile.tsx:276-290`, `PersonalTabs.tsx`, `admin`/`provider` sidebars

**Description.** Visually-styled tab strips built from `<button>`s and `<Link>`s with no `role="tablist"` / `role="tab"` / `role="tabpanel"`, no `aria-selected`, and no arrow-key navigation.

**Why it is a problem.** WCAG 4.1.2 and the WAI-ARIA Tabs pattern. Keyboard users must Tab through every tab individually; screen readers hear a list of buttons with no indication of which is active or how many there are.

**Recommended solution.** Implement the ARIA tabs pattern (roving `tabindex`, Left/Right/Home/End keys) in one `<Tabs>` component and use it in all four places. `PersonalTabs` navigates between routes, so it should instead be a `<nav>` with `aria-current="page"`.

---

### CMP-11 — `SaveButton` gives no confirmation feedback

- **Severity:** 🔵 Low · **Component:** `SaveButton.tsx`

**Description.** The only feedback is the icon fill plus a `count-flash` scale pulse. The background tint intended to reinforce it does not render (**DS-01**). There is no toast, no undo, and the header badge is off-screen on mobile.

**Recommended solution.** Add a brief toast — "Saved · View" / "Removed · Undo".

---

### CMP-12 — No toast/notification system exists

- **Severity:** 🟠 High · **Pages:** all

**Description.** There is no global toast or snackbar. Success and failure are communicated by inline text that replaces content in place (`{error && <p className="text-[13px] text-error …">`), appearing in ~20 different local styles.

**Why it is a problem.** Async results outside the user's viewport are simply never seen — e.g. saving a company from a card near the bottom of the page, or an admin toggling availability while scrolled down (`admin/index.tsx:362` puts the error inside the row, which may be off-screen). No action anywhere in the product is undoable.

**Recommended solution.** Add one accessible toast region (`role="status"` for success, `role="alert"` for errors), with an optional Undo action.

**Expected improvement.** Consistent, noticeable feedback for every mutation; enables undo, which materially reduces the risk of the destructive actions in **A11Y-06**.

---

### CMP-13 — `Stars` is presentational only

- **Severity:** 🔵 Low · **Component:** `Stars.tsx`

**Description.** Renders `n` filled star glyphs; the numeric rating sits in a sibling `<span>`.

**Why it is a problem.** A screen reader hears "star star star star star 4.8 (37)". Should be a single `role="img" aria-label="4.8 out of 5, 37 reviews"` with the glyphs `aria-hidden`.

---

### CMP-14 — `CatalogError` has no retry

- **Severity:** 🟡 Medium · **Component:** `CatalogError.tsx`

**Description.** Renders an icon and a message. There is no "Try again" button — the user's only recovery is a full page reload.

**Recommended solution.** Accept an `onRetry` and render a primary button; wire to the hook's `refresh()`.

---

### CMP-15 — `CatalogError` default message is hardcoded English

- **Severity:** 🟡 Medium · **Component:** `CompanyProfile.tsx:101`

**Description.** `<CatalogError message="We couldn't load this company. Please try again." />` — a literal English string passed on an Arabic-default site. Same pattern at `Home.tsx:552` (`"Couldn't submit your review. Please try again."`), `Companies.tsx:357` (`label = "Remove filter"`) and `useServerSearch.ts:122` (`"Search failed. Please try again."`).

**Why it is a problem.** Arabic users see English error text at the exact moment they most need to understand what went wrong.

**Recommended solution.** Move all four to `lib/i18n`. Add a lint rule forbidding string literals in JSX text position.

---

## 10. 🟠 HIGH — Forms

### FORM-01 — Errors are not announced and focus is not moved

- **Severity:** 🟠 High · **Pages:** `/request`, Home review modal, all admin editors

**Description.** Validation errors render as `{error && <p className="text-[13px] text-error …">{error}</p>}` — no `role="alert"`, no `aria-live`, no `aria-describedby` linking the message to its field, no `aria-invalid`, and no focus move to the first invalid field.

**Why it is a problem.** A screen-reader user submits, nothing is announced, and the form appears to do nothing. WCAG 3.3.1 and 3.3.3. Sighted users on long forms may not see the error if it is above the fold they are looking at.

**Recommended solution.** `role="alert"` on the message, `aria-invalid` + `aria-describedby` on the field, and `.focus()` on the first invalid input after a failed submit.

---

### FORM-02 — Errors are page-level, not field-level

- **Severity:** 🟠 High · **Component:** `Home.tsx:612`, `RequestForm.tsx:484-487`

**Description.** A single `error` string per form. In the review modal, "Name is required" renders at the bottom of the form, far from the name field. The `.error` class on `.field-input` is applied only to the textarea (`Home.tsx:608`), not to the name input that actually failed.

**Why it is a problem.** The user has to map a message at the bottom onto a field at the top. On a long form (`/request`) this is a real failure.

**Recommended solution.** Per-field error state; render the message under its field; keep a summary at the top that links to each error.

---

### FORM-03 — `.shake` animation is defined and never used

- **Severity:** 🔵 Low · **Component:** `index.css:279-284`

**Description.** A shake keyframe with the comment "form validation error" exists and no component applies it.

**Recommended solution.** Use it (guarded by `prefers-reduced-motion`, which the file already handles), or delete it.

---

### FORM-04 — Star rating buttons are labelled with a bare number

- **Severity:** 🟡 Medium · **Component:** `Home.tsx:588`

**Description.** `aria-label={`${s}`}` — the accessible name of each star button is the string "1", "2", …

**Why it is a problem.** A screen reader announces "3, button" with no context. No `role="radiogroup"`, no `aria-checked`, no keyboard arrow support.

**Recommended solution.** `aria-label={t(locale,'review_rate_n_stars', s)}` and a radiogroup pattern.

---

### FORM-05 — No `type="button"` on non-submit buttons inside forms

- **Severity:** 🟡 Medium · **Pages:** admin editors, provider editors

**Description.** `Home.tsx:587` correctly sets `type="button"` on the star buttons. Most other in-form buttons (add/remove row, tab switch, cancel) omit it.

**Why it is a problem.** A `<button>` inside a `<form>` defaults to `type="submit"`. Pressing Enter in a text field, or clicking a "remove row" control, can submit the form unexpectedly.

**Recommended solution.** Audit every `<button>` inside a `<form>`; add `type="button"` unless it is the submit action.

---

### FORM-06 — No autofocus, no autocomplete attributes

- **Severity:** 🟡 Medium · **Component:** `RequestForm.tsx`, Home review modal, `TeamTab`, `ProfileEditor`

**Description.** Modals do not focus their first field on open (see **A11Y-02**). No `autoComplete="name" | "tel" | "email"` anywhere.

**Why it is a problem.** On `/request` — the conversion form — a mobile user must tap into the first field manually and cannot use browser/keychain autofill for name and phone. This directly costs completions.

**Recommended solution.** Add `autoComplete` to every identity field; `autoFocus` (or programmatic focus) on the first field of each modal; `inputMode="tel"` on the phone field.

**Expected improvement.** Measurably faster form completion on mobile — usually the single highest-ROI form change.

---

### FORM-07 — `field-input` focus ring is invisible on tinted surfaces

- **Severity:** 🔵 Low · **Component:** `index.css:504-507`

**Description.** `:focus` sets `box-shadow: 0 0 0 3px rgba(0,85,120,0.12)` — a 12 %-alpha ring.

**Why it is a problem.** Against `surface-container` (`#eceef2`) the ring is barely perceptible. The global `:focus-visible` rule (`index.css:38-42`) is a solid 2 px outline, but the `.field-input:focus` box-shadow does not replace it — inputs get both, inconsistently, and the weaker one dominates visually.

**Recommended solution.** Raise the ring to ≥ 35 % alpha, and unify with the global focus token.

---

### FORM-08 — `modal-input` and `field-input` focus states differ

- **Severity:** 🔵 Low → see **DS-08**

---

### FORM-09 — Placeholder used as the only field description

- **Severity:** 🟡 Medium · **Pages:** most forms

**Description.** Several fields provide guidance only in the placeholder (`review_name_ph`, `review_district_ph`, `search_*_placeholder`).

**Why it is a problem.** Guidance vanishes the moment the user types — exactly when it is needed. WCAG 3.3.2.

**Recommended solution.** Move guidance to persistent helper text under the field, linked via `aria-describedby`.

---

## 11. 🟠 HIGH — UX & interaction design

### UX-01 — The "Available now" filter silently does nothing in API mode

- **Severity:** 🟠 High · **Page:** `/companies` · **Component:** `Companies.tsx:50, 89, 105`

**Description.** `availableOnly` is applied inside the `results` memo, which is the **demo-mode** list. In API mode `list = companySearch.data`, so the filter is never applied. The code comment at lines 47–49 acknowledges this is client-side, but the toggle is still rendered and still shows an active state.

**Why it is a problem.** In production the user toggles "Available now", the button turns solid primary, and the results do not change. A control that lies about what it did is worse than a missing control.

**Recommended solution.** Either implement the filter server-side, or hide/disable the toggle when `isApiConfigured()` with an explanatory tooltip.

---

### UX-02 — "Reset filters" does not reset all filters

- **Severity:** 🟠 High · **Component:** `Companies.tsx:111-116`

**Description.** `clearAll()` resets `category`, `minRating`, `sort` and `query` — but **not** `availableOnly`.

**Why it is a problem.** After "Reset", results remain filtered by an invisible criterion. `activeCount` (line 108) also excludes `availableOnly`, so no active-filter chip appears and the user has no way to discover or remove it except by reopening the sheet.

**Recommended solution.** Reset every filter in `clearAll()`; include every filter in `activeCount` and in the removable-chip row.

---

### UX-03 — Mobile filter badge counts the wrong filters

- **Severity:** 🟡 Medium · **Component:** `Companies.tsx:191-195`

**Description.** The badge counts `minRating > 0` and `sort !== "recommended"` — but not `category` or `availableOnly`.

**Why it is a problem.** With a category selected the badge reads "0" (hidden) even though results are filtered.

---

### UX-04 — Desktop is missing the "Available now" filter entirely

- **Severity:** 🟡 Medium · **Component:** `Companies.tsx:147-173` vs `282-291`

**Description.** The availability toggle exists only inside the mobile bottom sheet.

**Why it is a problem.** Desktop users cannot filter by availability at all — a feature-parity gap in a directory whose providers go busy/available.

---

### UX-05 — Above-the-fold hero content starts invisible ✅ VERIFIED LIVE

- **Severity:** 🟠 High · **Page:** `/` · **Component:** `Home.tsx:85-116`, `hooks/useReveal.ts`

**Description.** The hero `<h1>`, subtitle and both CTA buttons all carry `.fade-up` — `opacity: 0; transform: translateY(28px)` — until an `IntersectionObserver` adds `.visible`, then a **750 ms** transition runs. A screenshot taken shortly after navigation showed the hero image with **no text at all**.

**Why it is a problem.**

- **LCP is delayed by up to 750 ms + observer latency**, purely for decoration. The `<h1>` is almost certainly the LCP element.
- If JavaScript fails or is slow, the hero is **permanently blank** — the image loads, the headline never appears.
- Scroll-reveal is for content *below* the fold. Applying it to the first thing a user sees inverts its purpose.
- The `mt-16 md:mt-20` offset combined with the 28 px translate means the headline also moves during load — a CLS contributor.

**Recommended solution.** Render hero content visible by default; reserve `.fade-up` for elements below the fold. If an entrance is wanted, use a CSS animation that runs from first paint rather than an observer-gated transition.

**Expected improvement.** Faster LCP, no blank hero, more robust to JS failure. Directly affects Core Web Vitals and bounce rate on the landing page.

---

### UX-06 — Every mutation is fire-and-forget with no optimistic feedback

- **Severity:** 🟠 High · **Component:** `admin/index.tsx:143-156`

**Description.**

```js
const handleLeadStatus = (id, status) => {
  void updateLeadStatus(id, status).then(() => { if (leadApiMode) leadSearch.refresh(); });
};
```

No pending state, no error handling, no rollback. Changing a lead status from a `<select>` shows nothing until the refetch completes and the row re-renders.

**Why it is a problem.** On a slow connection the operator changes a status, sees no change, and changes it again. A rejected request is swallowed entirely — the `.then` has no `.catch`, so the UI silently keeps the old value with no explanation. The availability toggle at line 341 is the one place that does handle failure, which proves the team knows the problem and fixed only one instance.

**Recommended solution.** Optimistic update + rollback + error toast for every mutation. Extract one `useMutation`-style helper.

---

### UX-07 — Provider "no company" state is a dead end

- **Severity:** 🟡 Medium · **Component:** `ProviderDashboard.tsx:206-214`

**Description.** A provider whose account has no linked company sees an icon, a sentence, and a link back to the public site.

**Why it is a problem.** No explanation of *why*, no "contact support", no email, no ticket. The user's only option is to leave. This is the first screen a mis-provisioned provider ever sees.

**Recommended solution.** Explain the cause and offer a contact action using the admin-managed `support_email` already available in `lib/settings`.

---

### UX-08 — Admin availability toggle has no confirmation

- **Severity:** 🟡 Medium · **Component:** `admin/index.tsx:341-361`

**Description.** A single click on a small text button marks a company busy — which changes the **public** website, swapping every "Request service" CTA for "Join the waiting list".

**Why it is a problem.** The button is ~26 px tall in a dense row of four similar text buttons, one of which is "Delete". A mis-click has an immediate public consequence with no undo.

**Recommended solution.** Confirm the action, name the consequence ("customers will see a waiting list instead of a request button"), and offer undo.

---

### UX-09 — No global "unsaved changes" guard

- **Severity:** 🟡 Medium · **Pages:** admin/provider editors, `/request`

**Description.** Closing `CompanyEditor`, `CategoryEditor` or `ProfileEditor` via the `×`, or navigating away from a half-filled `/request` form, discards everything with no prompt.

**Why it is a problem.** `CompanyEditor` is a long multi-tab form. Losing it to a stray click is a serious operator frustration.

**Recommended solution.** Track dirty state; confirm on close and on route change (`useBlocker`); add `beforeunload` for the tab-close case.

---

### UX-10 — Company grid pagination resets scroll, admin pagination does not

- **Severity:** 🔵 Low · **Component:** `Companies.tsx:258` vs `admin/index.tsx:292-293`

**Description.** Public pagination calls `window.scrollTo({top:0})`; admin pagination passes `setPage` bare.

**Why it is a problem.** In admin, clicking "Next" at the bottom of a 20-row table swaps the rows above while the viewport stays at the bottom — the operator sees the *end* of page 2 and has to scroll up. Inconsistent between two paginators of the same component.

**Recommended solution.** Put the scroll behaviour inside `Pagination` (scroll to the top of the list container, not the window) and move focus to the results heading.

---

### UX-11 — Search results are not announced and have no empty-state action

- **Severity:** 🟡 Medium · **Component:** `Services.tsx:56-60`

**Description.** The no-results state is `search_off` + `No results for "x".` — no "Clear search" button, no suggestions, no link to browse all. `/companies` does this correctly with a "Reset filters" button; `/services` does not.

---

### UX-12 — `title=` tooltips used for real information

- **Severity:** 🟡 Medium
- **Component:** `CompanyProfile.tsx:389` ("self-reported"), `Companies.tsx:399`, `admin/index.tsx:324, 327, 355, 372`, `Home.tsx:405`

**Description.** Native `title` attributes carry meaningful disclosures.

**Why it is a problem.** `title` is invisible on touch (no hover), appears after a ~1 s delay on desktop, cannot be styled, is often skipped by screen readers, and cannot be reached by keyboard. The "self-reported" caveat on the completed-projects stat is a **trust disclosure** that most users will never see.

**Recommended solution.** Replace with a real popover on click/focus, or render the text inline.

---

### UX-13 — Disabled "Share review" button explains itself only by `title`

- **Severity:** 🔵 Low · **Component:** `Home.tsx:402-414`

**Description.** When reviews are closed, the button is `disabled` with `opacity-55` and a `title` explaining why.

**Why it is a problem.** Disabled buttons are not focusable, so the `title` never appears for keyboard users, and it never appears on touch. The user sees a greyed button with no reason.

**Recommended solution.** Keep the button enabled and explain on click, or render the reason as visible text beside it. (Never rely on `title` for the only explanation of a disabled state.)

---

### UX-14 — No confirmation after submitting a service request is reachable later

- **Severity:** 🟡 Medium · **Page:** `/request` → `/requests`

**Description.** The success screen (`RequestForm.tsx:534+`) shows a reference number. Since there is no account (**NAV-03**), that reference is tied to a `localStorage` claim token.

**Why it is a problem.** Clearing site data, switching devices, or using private browsing loses access to the request and any provider replies permanently, with no lookup by reference number.

**Recommended solution.** Add a "look up my request" flow by reference + phone, and offer to email/SMS the reference at submission time.

---

### UX-15 — Contact information exists only in the footer

- **Severity:** 🟡 Medium · **Component:** `Footer.tsx:44` (`id="contact"`)

**Description.** The `#contact` anchor is the footer brand block. Combined with **NAV-07** (hash links do not scroll from other routes), the product effectively has no contact page.

**Recommended solution.** A real `/contact` route with a form, hours, address and map.

---

## 12. 🟡 MEDIUM — Per-page findings

### Home — `/`

| ID | Sev | Component | Finding | Fix |
|---|---|---|---|---|
| HOME-01 | 🔴 | Project cards `Home.tsx:326,340,354` | `from-black/72` / `from-black/68` scrims do not render (**DS-01**) — white text directly on photos | Bracket syntax |
| HOME-02 | 🟠 | Hero `Home.tsx:85` | Hero starts at `opacity:0` — see **UX-05** | Render visible |
| HOME-03 | 🟡 | Stats `Home.tsx:487` | `useCountUp` animates from 0 on scroll-in; the number is unreadable while counting and the `tabular-nums` box still reflows in Arabic-Indic digits | Shorten to ≤ 600 ms; respect reduced-motion (currently `.count-flash` is guarded but `useCountUp` is not) |
| HOME-04 | 🟡 | Stats `Home.tsx:177` | Average rating shown as `4.8★` — a glyph concatenated into a number string, not localisable, and reads as "4.8 black star" | Use a `<Stars>` + number pairing |
| HOME-05 | 🟡 | `Home.tsx:319, 338, 352` | Project cards have `card-lift` hover and `cursor-default` — they lift on hover but are not clickable | Make them link to the company, or remove the hover lift |
| HOME-06 | 🟡 | `Home.tsx:338` | Small project cards use `style={{height: 148}}` — an inline pixel height outside the design system, and unrelated to the 2×148+16 = 312 px it should match against the 320 px hero card | Use `flex-1` or a token |
| HOME-07 | 🟡 | Reviews marquee `Home.tsx:428` | Auto-scrolling content with no visible pause control. Pauses on hover/focus only | Add a visible pause button (WCAG 2.2.2 requires a mechanism for content that moves > 5 s) |
| HOME-08 | 🟡 | Reviews marquee | Duplicate cards are `aria-hidden` + `tabIndex={-1}` (good) but the real ones are `tabIndex={0}` with no role — a screen reader hits N focusable, unlabelled group elements | Use `<article>` / `<blockquote>` and drop the tabindex |
| HOME-09 | 🔵 | `Home.tsx:444` | Review text wrapped in literal `"` quote characters in JSX | Use `<q>` or locale-aware quotation marks (Arabic uses « ») |
| HOME-10 | 🔵 | `Home.tsx:246` | `COMPANIES.filter(c => c.featured !== false)` renders **all** featured companies into a horizontal rail with no cap | Cap at 6–8 |
| HOME-11 | 🟡 | `Home.tsx:72-80` | Hero `<img>` has no `width`/`height` and no `fetchpriority="high"` | Add both; `index.html:17` already preloads it |
| HOME-12 | 🔵 | `Home.tsx:158` | Scroll cue is `bottom-8 left-1/2 -translate-x-1/2` with `animate-float` — fine, but it scrolls to `#stats` while the visible cue says "scroll down", and it remains visible after scrolling | Hide once scrolled |

### Services — `/services`

| ID | Sev | Component | Finding | Fix |
|---|---|---|---|---|
| SRV-01 | 🟠 | `Services.tsx:22` | `usePageMeta("Services | Al Assema", "Browse all service categories…")` — hardcoded English (**I18N-01**) | Localise |
| SRV-02 | 🟡 | `Services.tsx:38-42` | Breadcrumb is a `div` (**A11Y-16**) | `<nav>/<ol>` |
| SRV-03 | 🟡 | `Services.tsx:57-60` | Empty state has no clear-search action (**UX-11**) | Add action |
| SRV-04 | 🟡 | `Services.tsx:106` | `group-hover:translate-x-1` not mirrored (**RTL-09**) | Add `rtl:` |
| SRV-05 | 🔵 | `Services.tsx:99` | `text-body-md … text-sm` conflict (**TYPO-02**) | Remove one |
| SRV-06 | 🔵 | `Services.tsx:64` | `delay={i * 60}` unbounded — the 9th card waits 540 ms before appearing | Cap at `Math.min(i,5)*60`, as `Companies.tsx:248` already does |
| SRV-07 | 🔵 | `Services.tsx` | No sort, no result count, no pagination — inconsistent with `/companies` which has all three | Align the two list pages |

### Service category — `/services/:category`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| CAT-01 | 🟠 | Shares `pt-28` (**NAV-01**) and the `div` breadcrumb (**A11Y-16**) | As above |
| CAT-02 | 🟡 | No "no companies in this category yet" distinct from "no search results" | Separate the two empty states |
| CAT-03 | 🟡 | An unknown `:category` slug renders an empty list rather than a 404 | Redirect to `/services` with a message, or render `NotFound` |

### Companies — `/companies`

Covered by **UX-01…04**, **NAV-02**, **RTL-06**, **CMP-03**, **CMP-08**, **CMP-09**, **A11Y-09**, **A11Y-11**. Additional:

| ID | Sev | Component | Finding | Fix |
|---|---|---|---|---|
| CO-01 | 🟡 | `Companies.tsx:382, 386` | Card logo at `top-5 left-5`, save button at `top-3 right-3` — 8 px of asymmetry between two corner elements on the same card | Align both to the same inset |
| CO-02 | 🟡 | `Companies.tsx:395` | `pt-9` (36 px) on the card body reserves space for a logo overhang that does not exist — the logo is fully inside the `h-44` cover | Reduce to `pt-4`, or make the logo overhang as `Home.tsx:285` implies |
| CO-03 | 🟡 | `Companies.tsx:161, 169` | `text-[13px]` on `select.field-input` overrides the 16 px base | Keep 16 px on all form controls |
| CO-04 | 🔵 | `Companies.tsx:357` | `label = "Remove filter"` default is untranslated English (**CMP-15**) | Localise |
| CO-05 | 🔵 | `Companies.tsx:99` | `a.name.localeCompare(b.name)` with no locale argument — Arabic company names sort by code point, not Arabic collation | `localeCompare(b.name, locale)` |

### Company profile — `/companies/:slug`

| ID | Sev | Component | Finding | Fix |
|---|---|---|---|---|
| CP-01 | 🔴 | `CompanyProfile.tsx:128` | Sticky mobile CTA bar `bg-white/96` is transparent (**DS-01**) — the primary conversion control floats over scrolling content | Bracket syntax |
| CP-02 | 🟠 | `CompanyProfile.tsx:129` | Bar `bottom: calc(3.5rem + safe-area)` hardcodes the BottomNav height; `RequestBar` uses `.compare-bar-offset` which hardcodes the same value again in CSS (`index.css:625`) | One `--bottom-nav-h` variable |
| CP-03 | 🟠 | `CompanyProfile.tsx:128` + `RequestBar.tsx:51` + `BottomNav` | Three stacked fixed elements at the bottom on mobile. With the request basket open, the bottom ~180 px of the viewport is chrome | Merge the CTA and basket bars |
| CP-04 | 🟡 | `CompanyProfile.tsx:276-290` | Tab strip is not an ARIA tablist (**CMP-10**); tab state is not in the URL, so a shared profile link always opens on Overview | ARIA tabs + `?tab=` |
| CP-05 | 🟡 | `CompanyProfile.tsx:174` | Back button `top-20` overlaps the hero; on mobile the 64 px nav plus a 80 px offset places it 16 px below the header, but the hero is only `h-64` (256 px), leaving the button in the middle of the image | Anchor to the hero bottom |
| CP-06 | 🟡 | `CompanyProfile.tsx:175` | Back button calls `navigate(-1)` — if the profile was opened from an external link or a fresh tab, this leaves the site | Fall back to `/companies` when there is no history |
| CP-07 | 🟡 | Lightbox `CompanyProfile.tsx:55-65` | Arrow keys move by physical Left/Right and are not mirrored for RTL; there is no visible prev/next control, no counter ("3 / 12"), and no swipe indicator | Mirror keys under RTL; add visible controls and a counter |
| CP-08 | 🟡 | `CompanyProfile.tsx:213` | `bg-green-50 text-green-700` for the "responds in X" pill — stock Tailwind palette, never contrast-checked (**DS-07**) | Semantic token |
| CP-09 | 🟡 | `CompanyProfile.tsx:389` | "Self-reported" trust caveat is `title`-only (**UX-12**) | Real popover |
| CP-10 | 🔵 | `CompanyProfile.tsx:71-82` | JSON-LD omits `aggregateRating`, `address`, `telephone`, `openingHours` — the highest-value fields for local business rich results | Extend the schema |
| CP-11 | 🔵 | `CompanyProfile.tsx:184` | `-mt-10` pulls the identity bar over the hero; combined with `flex-col sm:flex-row`, the 80 px logo overlaps the hero image edge differently at each breakpoint | Fix the overlap per breakpoint |

### Guided start — `/start`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| GS-01 | 🟠 | `text-left` on both step-card variants (`GuidedStart.tsx:79, 107`) — **RTL-02** | `text-start` |
| GS-02 | 🟠 | Heading order is `1 4 4 4` — no `<h2>` for the step (**A11Y-15**) | Add step headings |
| GS-03 | 🟡 | Multi-step flow with no progress indicator, no step count, no back button visible in the audit path | Add "Step 2 of 3" + Back |
| GS-04 | 🟡 | Step changes are not announced and focus is not moved to the new step heading | `aria-live` region + focus move |
| GS-05 | 🔵 | Answers are not persisted — a refresh restarts the flow | Persist to `sessionStorage` or the URL |

### Saved — `/saved`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| SAV-01 | 🟠 | Horizontal overflow at 390 px in both locales (**RESP-01**) | Scrollable tab bar |
| SAV-02 | 🟠 | Unlabelled search input (**A11Y-08**) | `aria-label` |
| SAV-03 | 🟡 | Empty-state circle uses `bg-error/8` — invisible (**DS-01**) | Bracket syntax |
| SAV-04 | 🟡 | Saved list is `localStorage`-only — lost on device change, with no warning to the user | Explain persistence, or tie to identity (**NAV-03**) |
| SAV-05 | 🔵 | No bulk actions (compare, clear all, share list) | Add compare/clear |

### My requests — `/requests`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| REQ-01 | 🟠 | Horizontal overflow at 390 px; status filter chips measured **fully off-screen** at `left:-143px` (**RESP-01**) | Scrollable containers |
| REQ-02 | 🟠 | Detail modal has no focus trap, Escape, or accessible name (**A11Y-03**, **A11Y-04**) | Use the shared modal |
| REQ-03 | 🟡 | `bg-primary/6` info panel and `bg-error/8` error panel do not render (**DS-01**) | Bracket syntax |
| REQ-04 | 🟡 | Heading order `1 4 4 4` (**A11Y-15**) | Add `<h2>`s |
| REQ-05 | 🔵 | `-mr-1.5` on the modal close button (**RTL-04**) | `-me-1.5` |

### Messages — `/messages`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| MSG-01 | 🟠 | Horizontal overflow at 390 px (**RESP-01**) | Scrollable tab bar |
| MSG-02 | ✅ | ~~No `aria-live` on the message list~~ — **retracted.** `ChatThread.tsx:190-192` correctly sets `role="log" aria-live="polite"`, and all three chat surfaces (`/messages`, admin `ChatTab`, `ProviderChat`) reuse it | No action — see §20 |
| MSG-03 | 🟡 | No typing indicator, no delivery/read state, no timestamp grouping | Add conversation affordances |
| MSG-04 | 🟡 | On mobile the thread list and thread occupy the same route with no clear back affordance | Add an explicit back control |
| MSG-05 | 🟡 | `bg-primary/8` empty-state circle invisible (**DS-01**) | Bracket syntax |
| MSG-06 | ✅ | ~~Message bubbles may not mirror under RTL~~ — **retracted.** `ChatThread.tsx:207` uses `flex justify-end / justify-start`, which are logical in flexbox and mirror correctly | No action |

### Request form — `/request`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| RF-01 | 🟠 | `pt-20` leaves **4 px** of clearance under the 76 px desktop nav (**NAV-01**) — on the single most important page in the funnel | Shared offset |
| RF-02 | 🟠 | No `autoComplete`, no `inputMode`, no autofocus (**FORM-06**) | Add all three |
| RF-03 | 🟠 | Single page-level error string, not per-field (**FORM-02**) | Field-level errors |
| RF-04 | 🟡 | `bg-primary/6 border-primary/18` info callout and `bg-error/8` error callout do not render (**DS-01**) | Bracket syntax |
| RF-05 | 🟡 | Heading order `1 4 4 4` — a multi-section form with no section headings (**A11Y-15**) | Add `<fieldset>/<legend>` per section |
| RF-06 | 🟡 | No unsaved-changes guard (**UX-09**) | `useBlocker` |
| RF-07 | 🟡 | Success screen has no "add to calendar", no email/SMS of the reference, no link to Messages | Extend the success state |
| RF-08 | 🔵 | Submit button has a spinner but the form is not `aria-busy`, and fields are not disabled during submit | Add both |

### Legal — `/terms`, `/privacy`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| LEG-01 | 🟡 | `pt-24 pb-16 px-5` — a different container from every other page (no `max-w-container-max`, no `px-margin-*`) | Use the standard container |
| LEG-02 | 🟡 | Markdown rendered by `Markdown.tsx` with no prose typography scale — headings inside the document will not match the app's type ramp | Apply a `prose`-style token set |
| LEG-03 | 🟡 | No table of contents, no "last updated" date, no print stylesheet | Add all three |
| LEG-04 | 🔵 | Heading order `1 4 4 4` — the document's own headings do not appear in the outline | Ensure Markdown emits `h2`/`h3` |

### 404 — `*`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| NF-01 | 🟡 | `bg-primary/8` icon circle invisible (**DS-01**) | Bracket syntax |
| NF-02 | 🟡 | `pt-20` → 4 px desktop clearance (**NAV-01**) | Shared offset |
| NF-03 | 🟡 | No search box and no suggested destinations beyond two buttons | Add search + popular categories |
| NF-04 | 🔵 | `usePageMeta("Page Not Found | Al Assema")` — English on an Arabic-default site (**I18N-01**) | Localise |
| NF-05 | 🔵 | SPA 404s return HTTP 200; search engines index them | Serve a real 404 status from the host for unknown paths |

### Crash / error page

| ID | Sev | Finding | Fix |
|---|---|---|---|
| ERR-01 | 🟡 | `CrashScreen` hardcodes 10 hex colours and (by design) all copy in English — deliberate, but it means an Arabic user sees an English crash screen | Inline a minimal Arabic string set; keep the zero-dependency constraint |
| ERR-02 | 🟡 | No "reload" or "go home" primary action verified in the audit path | Ensure both exist |
| ERR-03 | 🔵 | `?debug=1` reveals stack traces to anyone who guesses the parameter | Gate on the admin role only |

### Maintenance / offline — `StatusScreen`

| ID | Sev | Finding | Fix |
|---|---|---|---|
| ST-01 | 🟠 | `RootLayout.tsx:69` renders a blank `min-h-screen` div while the status check settles — on a slow connection the user sees a **completely white page** with no spinner or logo | Render the logo + spinner instead |
| ST-02 | 🟡 | `useBackendHealth` failure replaces the entire site with an offline screen — including cached routes the user could still read | Show a dismissible banner for degraded mode; reserve the full takeover for a hard outage |
| ST-03 | 🔵 | No auto-retry with backoff and no "try again" button | Add both |

### Search overlay

| ID | Sev | Finding | Fix |
|---|---|---|---|
| SO-01 | 🟠 | `bg-primary/6` (active result) and `bg-primary/8` / `hover:bg-primary/14` (suggestion chips) do not render (**DS-01**) — **the keyboard-highlighted result has no highlight** | Bracket syntax |
| SO-02 | 🟡 | `activeIndex` is tracked but there is no `aria-activedescendant`, no `role="combobox"/"listbox"/"option"` | Implement the combobox pattern |
| SO-03 | 🟡 | The `/` shortcut is not discoverable — no hint in the search button's tooltip or the overlay | Show `Press / to search` |
| SO-04 | 🔵 | No recent searches, no result-count announcement | Add both |

---

## 13. 🟡 Admin dashboard

Covered above: **RTL-01** (drawer), **RTL-02/03/04** (alignment), **A11Y-01** (ModalShell), **A11Y-05/06** (destructive actions), **A11Y-18** (charts), **NAV-06** (URL state), **NAV-12** (landmarks), **CMP-02/03/04** (states), **UX-06** (mutations), **UX-08** (availability), **UX-09** (unsaved changes), **RESP-02** (tablet). Additional:

| ID | Sev | Screen | Component | Finding | Fix |
|---|---|---|---|---|---|
| ADM-01 | 🟠 | Shell | `admin/index.tsx:192` | `border-r` on the sidebar — physical; in RTL the rail's border draws on the outer edge instead of against the content | `border-e` |
| ADM-02 | 🟠 | Companies | `admin/index.tsx:337-377` | Four action buttons stacked at `py-1.5` (~26 px) in a `flex-col`, one of which navigates away and one of which changes the public site | 44 px targets; move secondary actions into an overflow menu |
| ADM-03 | 🟠 | Leads | `LeadsTab.tsx:94` | `<tr className="… text-left">` on the table header — **RTL-02** | `text-start` |
| ADM-04 | 🟠 | Leads | `admin/index.tsx:281-287` | A 6-column table at `md:` (768 px) beside a 256 px sidebar leaves ~470 px — columns collapse and truncate | Keep mobile cards until `lg:` |
| ADM-05 | 🟡 | Leads | `admin/index.tsx:260-268` | Two `<select>`s with `!w-auto`; the company filter grows to the longest company name and can push the count off the row | `max-w-[12rem] truncate` |
| ADM-06 | 🟡 | Leads | `admin/index.tsx:271-273` | Errors render as a static red bar with no retry | Add a retry action |
| ADM-07 | 🟡 | Leads | `admin/index.tsx:131-134` | Leads and waitlist entries are merged client-side, then paginated by `leadSearch` only — so page 2 can drop waitlist rows silently | Paginate the merged set server-side, or label the two sources separately |
| ADM-08 | 🟡 | Leads | `LeadsTab` | No bulk actions (multi-select, bulk status change, export) | Add selection + bulk bar |
| ADM-09 | 🟡 | Leads | `LeadsTab` | No column sorting on the desktop table | Add sortable headers with `aria-sort` |
| ADM-10 | 🟡 | Overview | `OverviewTab.tsx:154` | `text-left` on lead rows (**RTL-02**) | `text-start` |
| ADM-11 | 🟡 | Overview | `OverviewTab.tsx` | 4 hardcoded hex colours (**DS-07**) | Tokens |
| ADM-12 | 🟡 | Overview | `OverviewTab.tsx:83` | `bg-primary/8` empty circle invisible (**DS-01**) | Bracket syntax |
| ADM-13 | 🟡 | Company editor | `CompanyEditor.tsx:252` | Sticky footer `bg-surface-container-lowest/97` does not render (**DS-01**) — the sticky action bar is transparent over scrolling form content | Bracket syntax |
| ADM-14 | 🟡 | Company editor | `CompanyEditor.tsx:105` | Tab labels with `ml-1` counters (**RTL-04**); tabs are not an ARIA tablist (**CMP-10**) | `ms-1` + ARIA tabs |
| ADM-15 | 🟡 | Company editor | `CompanyEditor.tsx:189` | `bg-primary/6 border-primary/18` checkbox card invisible (**DS-01**) | Bracket syntax |
| ADM-16 | 🟡 | Company editor | — | A long multi-tab form with no validation summary; errors in a hidden tab are unreachable and unannounced | Mark invalid tabs; summarise on submit |
| ADM-17 | 🟡 | Category editor | `CategoryEditor.tsx` | 17 hardcoded `text-[..px]`; no icon picker preview at final size | Tokens; live preview |
| ADM-18 | 🟡 | Team | `TeamTab.tsx:263, 268` | `bg-error/8` error panel invisible; `ml-auto` action row (**DS-01**, **RTL-03**) | Both |
| ADM-19 | 🟡 | Reviews | `ReviewsTab.tsx:76, 183, 248` | `bg-error/8` invisible; `text-left` on cards; `ml-auto` on dates | Fix all three |
| ADM-20 | 🟡 | Change requests | `ChangeRequestsTab.tsx:128` | `text-left` on the request card (**RTL-02**) | `text-start` |
| ADM-21 | 🟡 | Project approvals | `ProjectApprovals.tsx:62, 84` | `bg-error/8` invisible; `text-left` on the title button | Both |
| ADM-22 | 🟡 | Conversations | `ChatTab.tsx` | No `aria-live` on incoming messages (**MSG-02**); `ConversationListItem.tsx:52` uses `bg-primary/8` for the active thread — **the selected conversation has no highlight** (**DS-01**) | Bracket syntax + live region |
| ADM-23 | 🟡 | Settings | `SettingsTab.tsx:365` | `bg-primary/8 hover:bg-primary/15` — the base state is invisible and only the hover state renders, so the chip appears on hover only | Bracket syntax |
| ADM-24 | 🟡 | Settings | `SettingsTab.tsx` | No save confirmation, no dirty-state indicator, no per-section save | Add all three |
| ADM-25 | 🟡 | Site status | `SiteStatusTab.tsx` | Enabling maintenance takes the **public site down** — the most consequential control in the product. Verify it has a typed confirmation and a visible "site is currently down" banner persisted across tabs | Typed confirm + global banner |
| ADM-26 | 🔵 | Shell | `admin/index.tsx:218` | `capitalize` on the page title (**RTL-11**) | Remove |
| ADM-27 | 🔵 | Shell | `admin/index.tsx:192` | `flex flex-col … hidden md:flex` — `hidden` and `flex` on the same element; works only because of Tailwind's utility ordering | `hidden md:flex md:flex-col` |
| ADM-28 | 🔵 | Shell | — | No global search (⌘K) across leads/companies/categories | Add a command palette |
| ADM-29 | 🔵 | Shell | — | No breadcrumb or context header inside tabs; the only location cue is the sidebar highlight and the `<h1>` | Add breadcrumbs once routes exist (**NAV-06**) |

---

## 14. 🟡 Provider dashboard

Covered above: **RTL-01** (drawer), **RTL-03** (`ml-auto`), **RTL-05** (active marker), **RTL-12** (literal arrow), **A11Y-19** (toggles), **RESP-06** (padding), **UX-07** (dead end), **NAV-06** (URL state). Additional:

| ID | Sev | Screen | Component | Finding | Fix |
|---|---|---|---|---|---|
| PRV-01 | 🟠 | Shell | `ProviderDashboard.tsx:256` | `border-r` on the sidebar (**ADM-01**) | `border-e` |
| PRV-02 | 🟠 | Overview | `ProviderDashboard.tsx:304` | `text-left` on the availability banner — the first thing a provider sees, left-aligned in Arabic | `text-start` |
| PRV-03 | 🟠 | Shell | `ProviderDashboard.tsx:291` | Sign-out uses `ml-auto` — in Arabic it lands beside the hamburger instead of at the trailing edge, adjacent to the menu button | `ms-auto` |
| PRV-04 | 🟠 | All | `ProviderDashboard.tsx` | 69 hardcoded `text-[..px]` and 8 hardcoded hex values in one file (**TYPO-01**, **DS-07**) | Tokens |
| PRV-05 | 🟠 | Leads | — | `bg-error/8` error panel invisible (`ProviderDashboard.tsx:797`) (**DS-01**) | Bracket syntax |
| PRV-06 | 🟡 | Sidebar | `ProviderDashboard.tsx:1014, 1018` | Active marker and badge both physical (**RTL-05**, **RTL-03**) — the admin twin is correct | Extract one component |
| PRV-07 | 🟡 | Availability | `AvailabilityControl.tsx:83` | Toggle knob is physical (**A11Y-19**); no `role="switch"` | Logical + ARIA |
| PRV-08 | 🟡 | Availability | `BusyWindowsEditor.tsx` | Date range editor with 19 hardcoded sizes and 1 hex; no validation feedback for overlapping windows visible in the audit path | Tokens + overlap validation |
| PRV-09 | 🟡 | Offerings | `OfferingsEditor.tsx` | 52 hardcoded `text-[..px]` — the densest offender in the codebase; a repeating row editor with no drag-reorder and no unsaved guard | Tokens; add reorder + guard |
| PRV-10 | 🟡 | Waitlist | `WaitlistManager.tsx:96` | `bg-error/8` invisible (**DS-01**) | Bracket syntax |
| PRV-11 | 🟡 | Profile | `ProfileEditor.tsx` | Changes go to an admin approval queue; verify the UI states this clearly *before* the user invests effort, not only after submit | Explain up front + show pending state |
| PRV-12 | 🔵 | Messages | `ProviderChat.tsx` | Correctly reuses `ChatThread`, so it inherits the live region and RTL-safe bubbles. Only the surrounding shell (headings, back affordance) needs the **MSG-03/04** treatment | Shell-level polish only |
| PRV-13 | 🟡 | Overview | — | Availability banner is a full-width `<button>` that navigates to another tab — styled as a status card, so it does not read as clickable | Add an explicit "Manage" affordance |
| PRV-14 | 🔵 | Shell | `ProviderDashboard.tsx:297` | `p-6` on mobile (**RESP-06**) | `p-4 md:p-6` |
| PRV-15 | 🔵 | All | — | No onboarding, no empty-state guidance for a brand-new provider with no leads, offerings or projects | Add a first-run checklist |

---

## 15. 🟡 Internationalisation

### I18N-01 — Every page title, description and social card is hardcoded English

- **Severity:** 🟠 High · **Component:** `hooks/usePageMeta.ts`, and every `usePageMeta(...)` call

**Description.**

```ts
const DEFAULT_TITLE = "Al Assema — Every Trusted Service in the New Capital";
const DEFAULT_DESC = "Find verified interior design, landscaping…";
```

Every caller passes English: `"Services | Al Assema"`, `"Verified Companies | Al Assema"`, `"Page Not Found | Al Assema"`, `${company.name} | Al Assema`. `index.html` ships the same English strings in `<title>`, `og:*` and `twitter:*` while declaring `lang="ar" dir="rtl"`.

**Why it is a problem.** Arabic is the default locale. An Arabic user's browser tab, bookmarks, browser history, and every WhatsApp/Facebook link preview are in English. `<html lang>` says Arabic while the content of `<meta description>` is English — search engines see a mismatch, which suppresses ranking in Arabic queries. This is a business problem as much as a UX one.

**Recommended solution.** Move all titles and descriptions into `lib/i18n` and pass `t(locale, key)`. Add `og:locale`, `og:url`, a canonical link, `hreflang` alternates for `ar`/`en`, and an `og:image` (currently `twitter:card` is `summary_large_image` with **no image**, so previews render blank).

**Expected improvement.** Correct link previews, correct browser history, and meaningful Arabic SEO.

---

### I18N-02 — `usePageMeta` cleanup restores only the title

- **Severity:** 🔵 Low · **Component:** `usePageMeta.ts:30-32`

**Description.** On unmount only `document.title` is reset; `description`, `og:*` and `twitter:*` retain the previous route's values.

**Why it is a problem.** Navigating Company A → Home leaves Company A's description in the `<meta>` tags. A share from that state is wrong.

**Recommended solution.** Restore or overwrite every tag the hook sets.

---

### I18N-03 — Four untranslated English strings in the UI

- **Severity:** 🟡 Medium → see **CMP-15** for the list

---

### I18N-04 — Numbers and dates are not locale-formatted

- **Severity:** 🟡 Medium · **Component:** `Home.tsx:177`, `Pagination.tsx:46`, `lib/format.ts`

**Description.** Counts render as bare JS numbers (`{total}`, `{from}–{to}`, `{c.rating}`) with no `Intl.NumberFormat`.

**Why it is a problem.** Arabic (Egypt) conventionally uses Arabic-Indic digits (٠١٢٣) in many contexts and a different thousands separator. `4.8★` concatenates a glyph into a number string. `formatReopenDate` does take a `locale`, which shows the intent exists — it just was not applied to numbers.

**Recommended solution.** One `formatNumber(locale, n)` helper used everywhere; decide the digit convention deliberately and apply it consistently.

---

### I18N-05 — Pluralisation is binary

- **Severity:** 🟡 Medium · **Component:** `Companies.tsx:208`, `Pagination.tsx:41`, `admin/index.tsx:269`

**Description.** `total === 1 ? singular : plural`.

**Why it is a problem.** Arabic has **six** plural forms (zero, one, two, few, many, other). `2 شركات` is wrong — the dual form is required. Every count in the product is grammatically incorrect in Arabic for at least some values.

**Recommended solution.** Use `Intl.PluralRules(locale)` and give the i18n dictionary a plural-category shape.

---

### I18N-06 — Language preference is not in the URL

- **Severity:** 🟡 Medium · **Component:** `LocaleContext.tsx`

**Description.** Locale lives in `localStorage` only.

**Why it is a problem.** An Arabic page cannot be shared as Arabic — the recipient gets their own stored preference or the default. Search engines can only ever index one language per URL, so half the content is invisible to search.

**Recommended solution.** Path prefixes (`/ar/…`, `/en/…`) or a `?lang=` parameter, plus `hreflang` alternates.

---

### I18N-07 — No `lang` attribute on language-switcher labels

- **Severity:** 🔵 Low · **Component:** `TopNav.tsx:184, 336`

**Description.** The toggle renders "English" while the document is `lang="ar"`.

**Why it is a problem.** An Arabic screen reader pronounces "English" using Arabic phonetics.

**Recommended solution.** `<span lang="en">English</span>` / `<span lang="ar">العربية</span>`.

---

## 16. 🟡 Animation & motion

### ANIM-01 — Reduced-motion support is thorough — keep it

- **Severity:** ✅ Strength · **Component:** `index.css:565-610`

The `prefers-reduced-motion` block covers scroll reveals, page transitions, the shimmer, float, pulse, scroll progress, the reviews marquee (including a specificity-matched RTL override), chart entrances, the drawer, all four hover lifts, and the lazy-image blur. This is better than most production apps. **Do not regress it.** Two gaps: `useCountUp` (JS-driven) and `.count-flash` timing are not guarded — see ANIM-04.

### ANIM-02 — Scroll reveals delay above-the-fold content

- **Severity:** 🟠 High → **UX-05**

### ANIM-03 — Staggered delays are unbounded

- **Severity:** 🟡 Medium · **Component:** `Services.tsx:64` (`i * 60`), `Home.tsx:351` (`(i+3) * 70`)

**Description.** `Companies.tsx:248` correctly caps at `Math.min(i,6)*60`; `Services.tsx` does not. With 12 categories the last card waits **660 ms** after entering the viewport.

**Why it is a problem.** During fast scrolling, content appears well after the user has passed it. Perceived as jank.

**Recommended solution.** Cap all stagger indices at 5–6 and shorten the base to ~40 ms.

### ANIM-04 — `useCountUp` is not reduced-motion aware

- **Severity:** 🟡 Medium · **Component:** `hooks/useCountUp.ts`, `Home.tsx:483`

**Description.** The stat counters animate numerically in JS. `prefers-reduced-motion` cannot reach a JS interval.

**Why it is a problem.** For a user with a vestibular disorder or a cognitive-load preference, four numbers rapidly cycling directly below the hero is exactly the pattern the setting exists to prevent.

**Recommended solution.** Read `matchMedia('(prefers-reduced-motion: reduce)')` in the hook and jump straight to the target.

### ANIM-05 — `transition-all` used widely

- **Severity:** 🟡 Medium · **Component:** `TopNav.tsx:100, 140, 149, 169, 178`, and ~40 other sites

**Description.** `transition-all duration-200` on nav links, buttons and cards.

**Why it is a problem.** `transition-all` animates every animatable property including `width`, `height`, `top` and `left`, which are layout-triggering and cannot be composited. On the nav, `backgroundImage` is being recomputed on scroll (see PERF-03) while `transition-all` is active.

**Recommended solution.** Enumerate: `transition-colors`, `transition-transform`, `transition-shadow`.

### ANIM-06 — Four different durations for the same interaction

- **Severity:** 🔵 Low

**Description.** Hover transitions run at `0.12s` (`btn-press`), `0.2s` (`filter-chip`, nav links), `0.3s` (`card-lift`, `card-scrim-hover`), `0.35s` (`shadow-bloom-hover`), `0.4s` (`transition-all-spring`), `0.45s` (`img-lazy`), and `duration-250` / `duration-300` / `duration-700` inline.

**Recommended solution.** Three tokens: `fast 120ms` (press), `base 200ms` (hover/colour), `slow 350ms` (layout/reveal). One easing per token.

### ANIM-07 — Hover lift distances vary from 2 px to 6 px

- **Severity:** 🔵 Low · **Component:** `index.css:80, 101, 108, 531`

**Description.** `soft-bloom-hover` −4 px, `shadow-bloom-hover` −5 px, `shadow-soft-hover` −2 px, `card-lift` −6 px. Cards in the same grid can use different ones.

**Recommended solution.** One lift value.

### ANIM-08 — `scroll-behavior: smooth` is global

- **Severity:** 🔵 Low · **Component:** `index.css:27-29`

**Description.** Set on `html` unconditionally and **not** disabled under `prefers-reduced-motion`.

**Why it is a problem.** Every anchor jump, every `scrollTo`, and every browser Find-in-page result animates. For motion-sensitive users this is exactly the trigger the media query exists to suppress. It also makes `ScrollRestoration` visibly animate on back-navigation.

**Recommended solution.** Add `html { scroll-behavior: auto }` inside the reduced-motion block.

---

## 17. 🟡 UI performance

### PERF-01 — Zero images declare intrinsic dimensions ✅ VERIFIED LIVE

- **Severity:** 🟠 High · **Pages:** all

**Description.** Measured: Home 22/22 images with no `width`/`height`; `/companies` 10/10; `/services` 8/8.

**Why it is a problem.** Without intrinsic dimensions the browser cannot reserve space before an image decodes, so every image is a **Cumulative Layout Shift** contributor. On `/companies` this means ~10 shifts per page load — text jumps as covers and logos land. CLS is a Core Web Vitals ranking factor.

**Recommended solution.** Add `width`/`height` (or an `aspect-ratio` CSS class) to every `<img>` and to `LazyImage`'s internal image. The card layouts already use fixed heights (`h-44`, `h-48`, `h-64`), so the values are known.

**Expected improvement.** Near-zero CLS from images — typically the single biggest Web Vitals win available.

---

### PERF-02 — Three images bypass lazy loading

- **Severity:** 🔵 Low · **Component:** `Logo.tsx`, `Home.tsx:74`

**Description.** The hero (correctly eager) plus two logo images load eagerly on every page.

**Recommended solution.** Add `fetchpriority="high"` to the hero (which is already preloaded) and `loading="lazy"` to the logo where it is not above the fold.

---

### PERF-03 — TopNav recomputes a 3-layer gradient on every scroll frame

- **Severity:** 🟡 Medium · **Component:** `TopNav.tsx:37-60, 86-98`

**Description.** `scrollProgress` is stored in React state and updated every rAF tick while scrolling within the first 80 px. Each update re-renders `TopNav` and produces a new inline `style` object containing a **three-layer `backgroundImage` string**, a two-part `boxShadow`, and a `borderBottom` — alongside `backdrop-filter: blur(28px) saturate(190%)`.

**Why it is a problem.** Changing `background-image` forces a repaint of a full-width element that also has a large backdrop-filter — one of the most expensive paint operations available. On mid-range Android this is the most likely source of scroll jank on the landing page. The `.mobile-scroll` rails and the marquee are simultaneously compositing.

**Recommended solution.** Drive the transition with a single CSS custom property (`--nav-p`) set via `ref.current.style.setProperty` — no React re-render — and express the layers in CSS using `color-mix()` or pre-declared gradients whose `opacity` is animated. Animate opacity of two stacked layers rather than rebuilding a gradient string.

**Expected improvement.** Removes the main-thread work and the repaint from the scroll path on the highest-traffic page.

---

### PERF-04 — `backdrop-filter` used on 8+ simultaneously-visible elements

- **Severity:** 🟡 Medium
- **Component:** `TopNav` (blur 28), `BottomNav` (`backdrop-blur-xl`), `CompanyProfile` CTA bar (blur 20 + saturate), `RequestBar`, `SearchOverlay`, modal backdrops, `glass-card`, `glass-panel`, `.mobile-cta-bar`

**Description.** On a Company Profile page at mobile, the top nav, the CTA bar, the request basket and the bottom nav are all backdrop-blurring simultaneously, over a scrolling image-heavy page.

**Why it is a problem.** `backdrop-filter` forces a separate compositing layer and a re-blur of everything behind it on every frame. Four stacked blurred surfaces on a mid-range Android device is a measurable frame-rate cost — and three of the four are currently transparent anyway because of **DS-01**, so the blur is being computed for no visual benefit.

**Recommended solution.** Reduce to two concurrent blurred surfaces; drop the blur on the bottom nav and the CTA bar in favour of a solid `rgba` background (which is what they were meant to have).

---

### PERF-05 — Admin and Provider dashboards are single chunks

- **Severity:** 🟡 Medium · **Component:** `main.tsx:26-27`

**Description.** `/admin` lazy-loads one chunk containing all 12 tabs plus `Charts`, all editors and all modals. `/provider` likewise.

**Why it is a problem.** An admin who only ever uses Leads downloads the chart library, every editor and every modal on first load.

**Recommended solution.** Convert tabs to nested routes (**NAV-06**) and `lazy()` each tab — one change delivers both the URL fix and per-tab splitting.

---

### PERF-06 — `RootLayout` prefetches four route chunks on every page

- **Severity:** 🔵 Low · **Component:** `RootLayout.tsx:25-42`

**Description.** During idle, Services, Companies, CompanyProfile and GuidedStart are imported. The effect has `[]` deps so it runs once per `RootLayout` mount — good — but it fires even for a user who landed directly on `/terms`.

**Why it is a problem.** On a metered mobile connection this is four chunks of speculative download.

**Recommended solution.** Gate on `navigator.connection.saveData` and `effectiveType`, and prefetch on link hover/viewport intersection instead.

---

### PERF-07 — `main` is keyed by pathname, remounting the whole tree per navigation

- **Severity:** 🔵 Low · **Component:** `RootLayout.tsx:79`

**Description.** `<main key={pathname}>` forces a full unmount/remount so the `page-enter` animation replays.

**Why it is a problem.** Every navigation discards all component state and all in-flight requests below `<main>`, and re-runs every `useEffect` including data fetches. Using an animation as the reason to remount the app tree couples presentation to lifecycle.

**Recommended solution.** Trigger the animation with a CSS class toggled on pathname change, not a `key`.

---

## 18. 🔵 Code quality (UI)

### CODE-01 — Two hand-copied sidebar implementations that have already diverged

- **Severity:** 🟠 High · **Component:** `admin/components/SidebarBody.tsx` vs `ProviderDashboard.tsx:1000-1030`

**Description.** The admin and provider sidebars are structurally identical — brand block, close button, nav list, active marker, badges, footer link. They are separate copies. The copies have already diverged in ways that matter:

| Concern | Admin (`SidebarBody`) | Provider (inline) |
|---|---|---|
| Active marker | `start-0`, `rounded-e-full` ✅ | `left-0`, `rounded-r-full` ❌ |
| Badge alignment | `ms-auto` ✅ | `ml-auto` ❌ |
| Back-arrow mirroring | missing `rtl-flip` ❌ | uses a literal `←` ❌ |

The admin file even carries a comment explaining *why* logical properties are required — and the fix was never propagated.

**Why it is a problem.** This is the clearest example of the codebase's central maintainability problem: fixes land in one copy. Every future RTL or a11y fix has to be applied twice and will be applied once.

**Recommended solution.** Extract `<DashboardShell>` + `<SidebarNav items badges onSelect>` used by both. Delete ~120 duplicated lines.

**Expected improvement.** RTL and a11y fixes apply to both dashboards at once.

---

### CODE-02 — Two hand-copied dashboard shells

- **Severity:** 🟠 High · **Component:** `admin/index.tsx:189-245` vs `ProviderDashboard.tsx:253-297`

**Description.** Layout wrapper, `<aside>`, mobile drawer, sticky top bar, hamburger, logo, `<h1>`, sign-out — duplicated. Already divergent: content padding (`p-4 md:p-6` vs `p-6`), drawer width (`max-w-[82vw]` vs `[84vw]`), top-bar flex (`justify-between` vs `gap-2` + `ml-auto`).

**Recommended solution.** One `<DashboardShell>`; both dashboards supply nav config and content.

---

### CODE-03 — The empty-state circle is written six times

- **Severity:** 🟡 Medium → **CMP-05**

### CODE-04 — Five hand-rolled modal implementations

- **Severity:** 🟡 Medium → **CMP-06**

### CODE-05 — 1,097 hardcoded font sizes, 29 hardcoded hex values, ~50 physical-direction utilities

- **Severity:** 🟠 High → **TYPO-01**, **DS-07**, **RTL-02/03/04**

### CODE-06 — `CompanyProfile.tsx` is ~900 lines with three inline modals

- **Severity:** 🟡 Medium

**Description.** The file contains the page, the availability badge, the feedback modal, the waitlist modal and the lightbox. `ProviderDashboard.tsx` is ~1,030 lines containing nine tabs and a sidebar.

**Why it is a problem.** Neither file can be reviewed in one pass; the modals inside them cannot be reused or tested in isolation, which is part of why they each re-implement dialog behaviour.

**Recommended solution.** Split modals into `components/`; split provider tabs into files as the admin tabs already are.

### CODE-07 — Conflicting Tailwind classes on the same element

- **Severity:** 🟡 Medium → **TYPO-02**. Also `admin/index.tsx:192` (`flex … hidden md:flex`), `SearchInput.tsx:25-26` (`text-[14px]` + inline `fontSize:16px`)

**Recommended solution.** Add `eslint-plugin-tailwindcss` with `no-contradicting-classname` and `enforces-shorthand`.

### CODE-08 — Dead CSS

- **Severity:** 🔵 Low

**Description.** `.input-premium` (unused), `.shake` (unused), `.masonry-grid`/`.masonry-item` (no usage found), `.glass`/`.glass-panel`/`.glass-card` (three near-identical glass utilities), the duplicated `[dir="rtl"] .rtl-flip` block, and the Alexandria webfont request.

**Recommended solution.** Delete; audit remaining utilities against usage.

### CODE-09 — No visual regression or a11y testing

- **Severity:** 🟠 High

**Description.** `@playwright/test` is installed. No test in the repo asserts layout, contrast, overflow or a11y.

**Why it is a problem.** Every bug in this report is mechanically detectable. **DS-01** in particular — the highest-impact finding — would have been caught by a single assertion that a nav bar's computed `background-color` is not transparent.

**Recommended solution.** Add a Playwright suite that, for every route × {390, 768, 1366} × {ar, en}:

1. asserts no horizontal overflow (`scrollWidth <= clientWidth`);
2. runs `@axe-core/playwright` and fails on serious/critical violations;
3. asserts every interactive element's box is ≥ 44 × 44 px;
4. captures a screenshot for visual diffing;
5. greps the built CSS for colour-opacity classes not present in the emitted stylesheet.

**Expected improvement.** This entire class of regression becomes impossible to merge.

---

## 19. Prioritised remediation plan

### Phase 1 — Stop the bleeding (½ day, mostly mechanical)

| Order | ID | Task |
|---|---|---|
| 1 | DS-01 | Convert all 42 non-scale opacity modifiers to bracket syntax; add the values to `theme.extend.opacity` |
| 2 | RTL-01 | Add `rtl:left-auto rtl:right-0` to both dashboard drawers |
| 3 | RESP-01 | Make `PersonalTabs` scrollable |
| 4 | RTL-02/03 | Global replace `text-left`→`text-start`, `ml-auto`→`ms-auto`, `border-r`→`border-e`, `-ml-1`→`-ms-1` |
| 5 | NAV-01/02 | One `--nav-h` variable; delete seven per-page paddings; fix `top-[60px]` |
| 6 | UX-02 | Reset `availableOnly` in `clearAll()`; include it in `activeCount` |

### Phase 2 — Accessibility floor (2–3 days)

| Order | ID | Task |
|---|---|---|
| 7 | A11Y-02 | Fix `useDialogA11y` to focus into the dialog and mark the background inert |
| 8 | A11Y-01 | Wire `ModalShell` to it; add `role`/`aria-modal`/`aria-labelledby`/scroll lock |
| 9 | A11Y-05/06 | Accessible names on all icon-only controls; real confirmation dialogs for destructive actions |
| 10 | A11Y-07 | Skip links in all three shells |
| 11 | A11Y-08/09 | Label all search inputs; `aria-live` on all result counts |
| 12 | A11Y-11/12/13 | 44 px touch-target floor; 12 px text floor; fix `text-outline/70` |
| 13 | A11Y-17 | `<Icon>` wrapper with `aria-hidden`; codemod all Material Symbols spans |
| 14 | CODE-09 | Playwright + axe suite so none of the above regresses |

### Phase 3 — Design system (3–5 days)

| Order | ID | Task |
|---|---|---|
| 15 | TYPO-01/03 | 7-step type scale; codemod 1,097 raw sizes; delete font-family aliases |
| 16 | RTL-10 | Direction-aware font stacks so Arabic headings use Cairo |
| 17 | TYPO-04 | Guard `uppercase`/`tracking` with `ltr:` |
| 18 | DS-04/05/06/07 | Radius ramp, elevation scale, spacing tokens, semantic state colours |
| 19 | PERF-01 | `width`/`height` on every image |
| 20 | CMP-01/02/03 | Matching skeletons; separate loading from empty; loading feedback on refetch |

### Phase 4 — Architecture & UX (1–2 weeks)

| Order | ID | Task |
|---|---|---|
| 21 | CODE-01/02 | Extract `DashboardShell` + `SidebarNav`; delete both duplicates |
| 22 | NAV-06 | Nested routes for both dashboards (fixes Back, deep links, and PERF-05) |
| 23 | CMP-06/12 | One `<Modal>`; one toast system with undo |
| 24 | I18N-01/04/05/06 | Localised meta, `Intl` numbers, `Intl.PluralRules`, locale in the URL |
| 25 | NAV-03/07 | Public sign-in; real `/about` and `/contact` routes |
| 26 | UX-05 | Remove scroll-reveal from above-the-fold hero content |
| 27 | PERF-03/04 | CSS-variable-driven nav; reduce concurrent backdrop filters |
| 28 | RESP-02 | Own the tablet breakpoint |

---

## 20. What is genuinely good

Worth stating plainly, because it should not be regressed during remediation:

- **Reduced-motion support** (`index.css:565-610`) is more thorough than most shipped products, including a specificity-matched RTL override for the marquee.
- **Code comments** are exceptional. Several explain *why* a fix exists (`main.tsx:59-64` on the `LocaleProvider` duplication; `index.css:391-401` on the RTL marquee; `index.css:241-245` on `animation-fill-mode: backwards` breaking `position: fixed`). This is institutional knowledge preserved in the right place.
- **`ChatThread`** is the model the rest of the codebase should follow: one component, reused by all three chat surfaces (customer `/messages`, admin `ChatTab`, `ProviderChat`), with `role="log" aria-live="polite"` on the message list and RTL-safe `justify-end`/`justify-start` bubble alignment. Two findings in this audit were retracted after checking it. Compare with the two hand-copied sidebars in **CODE-01**.
- **`useServerSearch`** is a well-built hook: real `AbortController` cancellation passed through to `fetch`, debounce skipped for the empty term, page reset on filter change, `paramsKey` serialisation to avoid identity churn.
- **Code splitting** on public routes with idle-time prefetch of the four most-likely next routes is the right instinct.
- **Error boundary placement** — `ErrorBoundary` above `RouterProvider`, with a zero-dependency `CrashScreen` that cannot itself throw — is correct and rarely done.
- **`Pagination`** requires both singular and plural nouns from the caller, with a comment explaining that the old `noun + "s"` default put English on Arabic screens. That is the right instinct applied properly; it just needs applying to the other five plural sites.
- **The maintenance/offline gate** deliberately exempts `/admin` and `/provider` so operators can work while the public site is down, and exempts logged-in admins so they can verify before flipping it back. Genuinely thoughtful product design.

---

*End of audit. 156 findings (2 retracted on verification). No code was modified.*
