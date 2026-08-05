# برومبت التنفيذ — تحسين لوحتَي الأدمن والمزوّد للموبايل

> **طريقة الاستخدام:** ابدأ بـ "التعليمات العامة" مرة واحدة، وبعدين انسخ **فيز واحدة بس** في كل مرة.
> ماتديش الـ agent أكتر من فيز في نفس الوقت. كل فيز ليها معايير قبول لازم تتحقق قبل ما تروح للي بعدها.
> المرجع الكامل لكل مشكلة: [`DASHBOARD-MOBILE-AUDIT.md`](DASHBOARD-MOBILE-AUDIT.md)
> نفس أسلوب [`FIX-PROMPT.md`](FIX-PROMPT.md) بتاع الـ audit الأولاني.

---

## ⚙️ التعليمات العامة (انسخها مع أول فيز، وكرّرها في بداية كل جلسة جديدة)

```
إنت Senior Frontend Architect + Accessibility Engineer شغال على مشروع "العاصمة" (Al Assema).

## السياق
- الريبو: monorepo فيه `api/` (Next.js + Prisma) و `app/` (Vite + React 18 + React Router 6 + Tailwind 3.4.13).
- شغلك كله في `app/` بس. ماتلمسش `api/` إلا لو الفيز طلبت كده صراحةً.
- في تقرير audit في `DASHBOARD-MOBILE-AUDIT.md` فيه 18 مشكلة (DM-01 … DM-18) بأرقام سطور
  وأدلة. اقرا الجزء الخاص بالفيز اللي شغال عليها قبل ما تبدأ أي تعديل.
- النطاق: `/admin` (10 تابات) و `/provider` (10 تابات) بس. الموقع العام اتعمله audit كامل
  قبل كده (`UI-UX-AUDIT.md`) و**اتقفل** — ماتفتحش مواضيعه تاني.
- اللغة الافتراضية **عربي RTL**. أي حاجة تصلحها لازم تتأكد إنها مظبوطة بالعربي الأول،
  وبعدين بالإنجليزي.

## قواعد ثابتة — ماتكسرهاش
1. **الرفع:** `npm run ship -- "وصف التعديل"` من جذر المشروع. بس. مفيش `rebase`، مفيش
   `push --force`، مفيش branches جديدة، مفيش merge — إلا لو مازن طلب صراحةً. برانش واحد ثابت.
2. **قاعدة البيانات:** ماتشغلش `seed` ولا `db:setup` ولا `prisma migrate reset` نهائيًا.
   الفيزات دي كلها frontend. الاستثناء الوحيد: Phase 0 محتاجة قاعدة لوكال **شغّالة ومزروعة
   بالفعل** عشان التستات تسجّل دخول — لو مش موجودة، شغّلها بـ
   `docker compose -f api/docker-compose.dev.yml up -d` وتأكد إن `api/.env` على
   `localhost:5433` قبل أي `db:seed`.
3. **OneDrive:** الريبو متزامن مع OneDrive. لو ظهر `index file corrupt` أو `index.lock`:
   `rm -f .git/index.lock` ثم `git reset`. بعد أي عملية git اعمل `git status` وتأكد.
4. **نطاق الفيز:** نفّذ اللي في الفيز الحالية **بس**. لو لقيت مشكلة تانية، سجّلها في
   `DASHBOARD-FIX-NOTES.md` وكمّل — ماتصلحهاش دلوقتي.
5. **ماتغيّرش سلوك شغّال:** ده شغل responsive + a11y. لو تعديل هيغيّر business logic،
   وقّف واسأل الأول.
6. **حافظ على الحاجات الكويسة:** الكومنتات اللي بتشرح "ليه" (RESP-02, CMP-09, PERF-04,
   ADM-27 …) — ماتحذفهاش. لو نقلت كود، انقل الكومنت معاه.
7. **إعادة الاستخدام قبل الكتابة:** أغلب الفيزات دي حلها "استورد الموجود" مش "اكتب جديد".
   لو لقيت نفسك بتكتب كومبوننت من الأول، اتأكد الأول إنه مش موجود في `components/`.

## طريقة الشغل في كل فيز
1. اقرا قسم الفيز كامل + بنود الـ DM المذكورة فيه من `DASHBOARD-MOBILE-AUDIT.md`.
2. اعمل خطة مختصرة بالملفات اللي هتتلمس، واعرضها عليا قبل التنفيذ.
3. نفّذ.
4. شغّل `cd app && npx tsc -b --noEmit` و `npm run build` — لازم يعدّوا من غير أخطاء.
5. شغّل `npm run test:ui-audit` وقارن بالنتيجة اللي قبل الفيز.
6. اختبر يدويًا **بالعربي وبالإنجليزي** على 390px و768px و1366px.
7. اعمل ملخص before/after بالـ IDs اللي اتقفلت، وسجّله في `DASHBOARD-FIX-NOTES.md`.
8. ارفع بـ `npm run ship -- "..."` بالرسالة المكتوبة في آخر الفيز.
```

---

## 🧪 PHASE 0 — شبكة الأمان (2–3 ساعات) ✅ **اتنفّذت 2026-08-03**

> النتيجة والأرقام في [`DASHBOARD-FIX-NOTES.md`](DASHBOARD-FIX-NOTES.md) § Phase 0.
> **مهم قبل ما تبدأ Phase 1:** الـ harness بيقيس الـ route وهي مفتوحة أول مرة بس،
> فـ DM-09 و DM-05 والنص المخبّي من DM-06 (اللي جوّا modals) **لسه مش مغطّيين**.
> شوف قسم "قيود" في الـ notes — محتاجين interaction pass.
>
> القسم تحت متسيب كما هو للمرجعية.

> **ابدأ من هنا إجباريًا.** التستات الحالية بتصوّر شاشة تسجيل الدخول مش اللوحات —
> يعني كل الـ baselines بتاعة `/admin` و`/provider` مالهاش أي قيمة. الفيز دي بتحوّل
> باقي المستند من "قائمة تتراجع باليد" لـ "تست أحمر تصلّح عليه".

```
## الهدف
نخلي مصفوفة تستات الموبايل تدخل اللوحات فعليًا بدل ما تقف على شاشة اللوجين.
المرجع: DASHBOARD-MOBILE-AUDIT.md § DM-01.

## الخلفية
`app/tests/ui-audit.spec.ts:44-51` فيه كومنت صريح بيقول إن `/admin` و`/provider`
بيتصوّروا من غير session. النتيجة: كل `tests/__baseline__/admin-390-*.png` و
`provider-390-*.png` هي صورة **فورم تسجيل دخول**. التستات بتقول أخضر وهي مش
بتفحص حاجة.

الأربع assertions الموجودة أصلاً في الملف (overflow / axe / touch targets 44px /
مفيش نص أقل من 12px) **كفاية** — مش محتاج تكتب assertions جديدة عشان تمسك
DM-06 و DM-09 و DM-10 و DM-18. هي هتفشل لوحدها أول ما التستات تدخل اللوحات.

## المهام

### 0.1 — Storage state للأدمن والمزوّد
- `app/e2e/admin.spec.ts` عارف يسجّل دخول بالفعل — اقراه واستخدم نفس الـ credentials
  من الـ seed.
- اعمل `app/tests/auth.setup.ts` كـ Playwright setup project يعمل login مرتين
  (ADMIN و PROVIDER) ويحفظ:
  - `app/tests/.auth/admin.json`
  - `app/tests/.auth/provider.json`
- ضيف `tests/.auth/` في `.gitignore` — دي فيها توكنات session.
- في `playwright.ui-audit.config.ts` ضيف الـ setup project و `dependencies` عشان
  يشتغل قبل التستات.

### 0.2 — وسّع مصفوفة الـ routes
في `ui-audit.spec.ts`، بدل السطرين بتوع `/admin` و`/provider`، ضيف:

| الاسم | المسار | الـ storage state |
|---|---|---|
| admin-overview | `/admin/overview` | admin |
| admin-leads | `/admin/leads` | admin |
| admin-companies | `/admin/companies` | admin |
| admin-services | `/admin/services` | admin |
| admin-reviews | `/admin/reviews` | admin |
| admin-changes | `/admin/changes` | admin |
| admin-chat | `/admin/chat` | admin |
| admin-team | `/admin/team` | admin |
| admin-settings | `/admin/settings` | admin |
| provider-overview | `/provider` | provider |
| provider-leads | `/provider?tab=leads` | provider |
| provider-messages | `/provider?tab=messages` | provider |
| provider-projects | `/provider?tab=projects` | provider |
| provider-reviews | `/provider?tab=reviews` | provider |
| provider-analytics | `/provider?tab=analytics` | provider |
| provider-availability | `/provider?tab=availability` | provider |
| provider-profile | `/provider?tab=profile` | provider |
| provider-settings | `/provider?tab=settings` | provider |

خلّي الـ routes العامة الموجودة زي ما هي (من غير storage state).

### 0.3 — Baselines جديدة
امسح `admin-*.png` و `provider-*.png` القديمة من `tests/__baseline__/` (دي صور
لوجين مالهاش لازمة) وولّد بدالها بـ `--update-snapshots`.

### 0.4 — assertion زيادة: nested scroll (تمهيد لـ DM-05)
ضيف step جديدة تفشل لو في عنصر جوّاه scroll رأسي (`scrollHeight > clientHeight + 1`)
وهو نفسه جوّا عنصر تاني بيعمل scroll، على 390px بس. ده اللي هيمسك مشكلة الشات
المتراكب في DM-05.

### 0.5 — تشغيلة standalone (تمهيد لـ DM-04)
ضيف project تانية في الـ config بتشغّل الـ routes بتاعة اللوحات على 390px مع
`display-mode: standalone` emulation. من غيرها، قيم `env(safe-area-inset-*)`
بتساوي صفر في المتصفح العادي وإصلاحات DM-04 هتعدّي من غير ما حد يلاحظ لو رجعت.

## معايير القبول
- [ ] `npm run test:ui-audit` بيدخل اللوحات فعليًا (شوف الـ screenshots — لازم تشوف
      السايدبار والتابات، مش فورم لوجين).
- [ ] التستات **بتفشل** على touch targets في `provider-leads` (المتوقع: select بـ ~26px،
      زرار delete بـ ~38px) — ده إثبات إنها شغالة.
- [ ] بتفشل كمان على `admin-changes` (checkbox بـ 16px) و `admin-settings` (تاب بـ ~42px).
- [ ] `tests/.auth/` مش متتبّع في git.

## مهم
الفيز دي **مش المفروض** تصلّح أي حاجة في اللوحات. لو التستات كلها نجحت يبقى في غلط
في الـ setup نفسه. المطلوب إنها **تفشل بشكل صحيح** — سجّل عدد الـ failures في
`DASHBOARD-FIX-NOTES.md` عشان تقارن بيه بعد كل فيز.

## الرفع
npm run ship -- "test: authenticate dashboard routes in mobile ui-audit matrix"
```

---

## 🟢 PHASE 1 — المكاسب الميكانيكية (3–4 ساعات)

> كلها إعادة استخدام لكود موجود أو إضافة prefix. أعلى عائد لكل ساعة في المستند كله.

```
## الهدف
إصلاح خمس مشاكل حلها كله "استورد الموجود" أو "ضيف sm:".
المرجع: DM-03, DM-09, DM-10, DM-17, DM-18.

## المهام بالترتيب

### 1.1 — DM-03 (🟠 الأهم في الفيز): كروت الليدز في لوحة المزوّد
`ProviderDashboard.tsx` فيه `LeadRows` (سطر ~760) — layout واحد لكل العروض.
لوحة الأدمن عاملة الصح: جدول `hidden lg:block` + `LeadMobileCard` تحته
(`admin/tabs/LeadsPage.tsx`).

الحل:
- `LeadMobileCard` و `LeadModal` و `WaitlistDetailModal` **مصدّرين بالفعل** من
  `admin/LeadsTab.tsx` وبياخدوا نفس الـ union اللي المزوّد بانيه أصلاً.
- استوردهم في `ProviderDashboard.tsx`.
- في تاب الليدز: خلّي `LeadRows` جوّا `hidden lg:block`، وضيف تحتها
  `lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3` فيها `LeadMobileCard`.
- الكارت بيفتح modal — وصّل `onOpen` بـ state جديدة (`selectedLead` /
  `selectedWaitlist`) بنفس الباترن الموجود في `LeadsPage.tsx`.
- نفس الحاجة في "Recent leads" في تاب الـ overview.

**تنظيف مطلوب:** `LeadListRow` معرّف مرتين بنفس الشكل بالظبط —
`admin/LeadsTab.tsx:34` و `ProviderDashboard.tsx:66`. سيب اللي في `LeadsTab.tsx`
واحذف التاني واستورده.

> ملاحظة: `LeadMobileCard` بيعرض `lead.district` واللي المزوّد كان بيعرضه مع
> `budget`. لو ناقص حاجة مهمة للمزوّد، زوّد الكارت نفسه (مكان واحد للاتنين) —
> ماتعملش نسخة تانية منه.

### 1.2 — DM-09: تابات `CompanyEditor` بتعمل overflow جوّا الـ modal
`admin/CompanyEditor.tsx:132` بيبعت لـ `Tabs`:
`className="flex gap-1 border-b border-outline-variant/20 px-1 -mt-2 mb-5"`
مفيش `overflow-x-auto` ولا `flex-wrap`. 4 تابات بالعربي ≈ 360px جوّا صندوق ≈ 318px.

الحل — نفس باترن `PersonalTabs.tsx:30` المستخدم صح:
- `className`: ضيف `max-w-full overflow-x-auto scrollbar-hide`
- `tabClassName`: ضيف `whitespace-nowrap flex-shrink-0`

الأفضل: حطّ `max-w-full overflow-x-auto scrollbar-hide` جوّا `Tabs.tsx` نفسه على
الـ `<div role="tablist">` عشان أي caller جاي يورثها. لو عملت كده، اتأكد إن
`CompanyProfile.tsx` (الـ caller التاني) لسه شكله مظبوط.

### 1.3 — DM-10: `grid-cols-2` من غير breakpoint
خمس مواقع. غيّرها كلها لـ `grid-cols-1 sm:grid-cols-2`:

| الملف | السطر | الخطورة |
|---|---|---|
| `admin/AdminOfferingsPanel.tsx` | 256 | 🟡 selects بتتقص |
| `admin/AdminOfferingsPanel.tsx` | 279 | 🟡 selects بتتقص |
| `admin/ReviewsTab.tsx` | 270 | 🔵 نص للقراءة بس |
| `admin/LeadsTab.tsx` | 161 | 🔵 نص للقراءة بس |
| `admin/LeadsTab.tsx` | 210 | 🔵 نص للقراءة بس |

الاتنين بتوع `AdminOfferingsPanel` هما المشكلة الحقيقية: `select.field-input`
بياخد `16px + 44px` padding، فجوّا خانة 155px بيفضل ~95px للنص —
«على المعاينة» و«سعر لكل وحدة» بتتقص.

### 1.4 — DM-17: أزرار بأيقونة بس من غير `aria-label`
تلات مواقع فيها `<span className="hidden sm:inline">` حوالين النص، والزرار معتمد
على `title` بس (والـ `title` مش بيظهر على اللمس):
- `admin/AdminLayout.tsx:60` — تسجيل الخروج
- `ProviderDashboard.tsx:283` — تسجيل الخروج
- `admin/tabs/CompaniesPage.tsx:86` — إضافة شركة

ضيف `aria-label` جنب الـ `title` في التلاتة.

### 1.5 — DM-18: شريط تابات الإعدادات
`admin/SettingsTab.tsx:190`: `py-3` + `text-label` (line-height 18px) = 42px.
غيّرها لـ `py-3.5` أو ضيف `min-h-[44px]`.

## معايير القبول
- [ ] على 390px، تاب الليدز في `/provider` بيعرض كروت — نفس شكل `/admin/leads` بالظبط.
- [ ] الكارت بيفتح modal التفاصيل، وتغيير الحالة من جوّا الـ modal بيتحدّث في الليستة.
- [ ] `provider-leads-390-ar` و `-en` بقوا شبه `admin-leads-390-*` في الـ screenshots.
- [ ] `CompanyEditor` على 390px: التابات بتعمل scroll أفقي جوّا نفسها، والـ modal نفسه
      مفيش فيه scroll أفقي.
- [ ] `AdminOfferingsPanel` على 390px: نص الـ selects كامل مش متقصوص، بالعربي.
- [ ] عدد failures التستات قلّ عن رقم Phase 0 — سجّل الرقم الجديد.

## الرفع
npm run ship -- "fix(provider): mobile lead cards + responsive grids and tabs in admin editors"
```

---

## 🟠 PHASE 2 — اللمس والحواف الآمنة (3–4 ساعات)

> كنسة منهجية على بندين. التستات بتاعة Phase 0 بتتحقق منهم آليًا.

```
## الهدف
كل عنصر تفاعلي ظاهر على الموبايل >= 44×44px، وكل حواف اللوحات محترمة للـ notch.
المرجع: DM-06, DM-04.

## المهام

### 2.1 — DM-06: أهداف اللمس
الباترن الصح **موجود بالفعل** في الكود — استخدمه، ماتخترعش واحد جديد:
- أزرار الأيقونات: `w-11 h-11 -m-2.5 flex items-center justify-center`
  (زي `Modal.tsx:104` و `CompanyEditor.tsx:385`) — 44px hit box بصفر تكلفة layout.
- الـ selects والـ pills: `min-h-[44px]` (زي `tabs/CompaniesPage.tsx:135`).

| العنصر | الملف | المقاس دلوقتي | الحل |
|---|---|---|---|
| select حالة الليد | `ProviderDashboard.tsx` (`LeadRows`) | ~26px | `min-h-[44px]` |
| زرار حذف الـ waitlist | نفس الملف، `p-1.5` | ~38px | `w-11 h-11 -m-2.5` |
| قفل/فتح المحادثة | `admin/ChatTab.tsx:165` | ~28px | `min-h-[44px]` |
| إخفاء/إظهار رسالة | `components/ChatThread.tsx:241` | ~16px | `min-h-[44px] px-2` |
| checkbox حقول التغيير | `admin/ChangeRequestsTab.tsx:404` | 16px | لُف الـ `<label>` بـ `min-h-[44px] flex items-center` |
| نجمة تمييز المشروع | `admin/CompanyEditor.tsx:382` | ~38px | `w-11 h-11 -m-2.5` |

> أهم واحدة فيهم: checkbox الـ change requests. الموافقة الانتقائية (وافق على 3 حقول
> من 5) هي أهم أداة للأدمن في الشاشة دي، وهي دلوقتي 16px.

بعد ما تخلص، شغّل التستات — لو لسه في عناصر تحت 44px مالهاش ذكر في الجدول ده،
سجّلها في `DASHBOARD-FIX-NOTES.md` وصلّحها لو كانت ظاهرة على الموبايل.

### 2.2 — DM-04: الحواف الآمنة في `DashboardShell`
`components/DashboardShell.tsx` مفيهوش أي `env(safe-area-inset-*)`. الموقع العام
عامل ده صح — اتعلّم منه (`index.css:698-707`, `BottomNav.tsx:24`).

تلات تصادمات حقيقية في وضع standalone:
1. التوب-بار `sticky top-0 ... py-3` (سطر 65) → الهامبرجر والعنوان تحت الـ notch.
2. الـ drawer `h-full` (سطر 53) ولينك "الرجوع للموقع" في آخره → تحت شريط الهوم.
3. `admin/SettingsTab.tsx:210` — `sticky bottom-0` وفيه **زرار الحفظ** → تحت شريط الهوم.

الحل — helper واحد في `index.css` بدل ما تنثر `env()` في الـ JSX. **مهم:**
مرّر القيم عبر CSS custom properties، **مش** `env()` مباشرة:
```css
/* أخو bottom-nav-safe — للوحات، اللي مالهاش bottom nav لكن ليها
   sticky topbar و drawer و save bar.
   الـ indirection عبر متغيّر مش رفاهية: Chromium مش بيعرف يعمل emulation
   للـ safe-area insets خالص (اتجرّب في Phase 0 بـ --safe-area-insets و
   --force-display-mode-standalone، والاتنين مالهمش أي تأثير — القيمة فضلت 0px).
   لما القيمة تعدّي على متغيّر، التست يقدر يـ override المتغيّر ويقيس الـ layout
   فعلاً. من غير كده، إصلاح DM-04 بيعدّي في التستات سواء اشتغل أو لأ. */
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
.dashboard-topbar-safe { padding-top: max(0.75rem, var(--safe-top)); }
.dashboard-bottom-safe { padding-bottom: max(0.75rem, var(--safe-bottom)); }
```
وطبّقها على: التوب-بار، آخر الـ drawer، الـ `<div className="p-4 md:p-6">` بتاع
المحتوى، والـ save bar بتاع الإعدادات.

### 2.3 — تست DM-04
ضيف في `ui-audit.spec.ts` (أو ملف منفصل) حالة بتعمل:
```ts
await page.addStyleTag({ content: ":root{--safe-top:59px;--safe-bottom:34px}" });
```
وبعدين تتأكد إن أول 59px من الشاشة مفيهاش أي عنصر تفاعلي، وإن زرار حفظ
الإعدادات فوق آخر 34px. من غير الخطوة دي، DM-04 مش متحقَّق منه — بس موصوف.

## معايير القبول
- [ ] تست DM-04 (2.3) بيفشل قبل الإصلاح وبينجح بعده.
- [ ] في DevTools بـ iPhone 14 Pro simulation: الهامبرجر تحت شريط الحالة
      مش وراه، وزرار حفظ الإعدادات فوق شريط الهوم.
- [ ] الـ drawer في العربي (RTL) لسه بيفتح من اليمين وحوافه مظبوطة.
- [ ] مفيش تغيير بصري على الـ desktop (1366px) — قارن بالـ baselines.

## الرفع
npm run ship -- "fix(dashboards): 44px touch targets and safe-area insets for standalone"
```

---

## 🔵 PHASE 3 — تحويل لوحة المزوّد لـ routes (5–7 ساعات)

> الـ refactor الحقيقي الوحيد في المستند. بندين تانيين بيتحلّوا معاه ببلاش.

```
## الهدف
تحويل تابات لوحة المزوّد من `useState` لـ nested routes حقيقية — زي ما اتعمل
للأدمن في NAV-06.
المرجع: DM-02, ومعاه DM-12 و DM-13 اللي بيقعوا منها.

## الخلفية
`ProviderDashboard.tsx:88-92`: `useState<ProviderTab>` بيقرا `?tab=` مرة واحدة على
الـ mount وعمره ما بيكتب تاني. على الموبايل زرار/جيست الرجوع هو وسيلة التنقل
الأساسية، وفي PWA مثبّتة مفيش URL bar أصلاً — فالرجوع بيطلّع المزوّد بره اللوحة
خالص، وأي refresh بيرجّعه على Overview.

**القدوة:** `admin/AdminLayout.tsx` + `AdminIndexRedirect` + الـ routes في `main.tsx`.
اقراهم كويس قبل ما تبدأ — الحل هو نفس الشكل بالظبط.

## المهام

### 3.1 — DM-02: الـ routes
- اعمل `pages/provider/ProviderLayout.tsx` على وزن `AdminLayout.tsx`:
  `DashboardShell` + `ProviderSidebarBody` + `<Suspense><Outlet /></Suspense>`.
- قسّم جسم `ProviderDashboard.tsx` (1042 سطر) لملفات تاب تحت `pages/provider/tabs/`:
  `OverviewPage`, `LeadsPage`, `MessagesPage`, `ProjectsPage`, `ReviewsPage`,
  `AnalyticsPage`, `AvailabilityPage`, `PricingPage`, `ProfilePage`, `SettingsPage`.
- `SidebarNav` يتحوّل من `onSelect` لـ `linkTo={(id) => `/provider/${id}`}`.
- اعمل `ProviderIndexRedirect` زي `AdminIndexRedirect` بالظبط — لازم يحافظ على
  `?tab=` القديم، لأنه **متبعوت فعلاً في payload الإشعارات من السيرفر**
  (شوف `api/` — بيبعت `/provider?tab=messages`). ماتكسرش اللينكات دي.

> **انتبه:** الـ state المشتركة (`useMyCompany`, `useLeadStats`, `leadSearch`,
> `waitlistSearch`) دلوقتي في الكومبوننت الأب. اللي منها بيتشارك بين تابات، رفّعه
> للـ layout ووزّعه بـ `useOutletContext` (`RootLayout.tsx` بيستخدم نفس الحيلة مع
> `openSearch`). اللي بيخص تاب واحد، نزّله جوّاه.

### 3.2 — DM-12: تقسيم الـ chunks
بمجرد ما التابات تبقى routes، خلّي كل واحدة `lazy()` في `main.tsx` بنفس شكل الأدمن.
ده بيشيل `Charts` و `OfferingsEditor` و `ProviderChat` و مكتبة التحليلات من الحزمة
الأولى اللي المزوّد بيحمّلها عشان يشوف عدد الليدز بتاعه.

### 3.3 — DM-13: الإشعار بيفتح نافذة تانية
`public/sw.js:40-52` بيعمل focus لنافذة موجودة بس لو `client.url.includes(target)`.
إشعار الشات هدفه `/provider?tab=messages`؛ مزوّد قاعد على `/provider?tab=overview`
بيفشل في الشرط ده، فالـ SW بيفتح **نافذة جديدة**.

الحل بعد 3.1:
- في `sw.js`: قارن بالـ `pathname` بس (مش الـ URL كامل) في الـ `includes`.
- لما يلاقي نافذة، ابعتلها `postMessage` بالمسار المطلوب بدل ما يكتفي بـ `focus()`.
- في `ProviderLayout`: `navigator.serviceWorker.addEventListener("message", ...)`
  ويعمل `navigate()` للمسار الجاي.

## معايير القبول
- [ ] كل تاب مزوّد ليه URL خاص بيه ويفتح مباشرة من غير ما يرجع لـ Overview.
- [ ] زرار الرجوع في المتصفح بينقل بين التابات، **مش** بيطلّع بره اللوحة.
- [ ] `/provider?tab=messages` (الشكل القديم) لسه بيوصل لتاب الرسايل.
- [ ] refresh على أي تاب بيفضل على نفس التاب.
- [ ] في Network tab: فتح `/provider` مش بيحمّل شنك التحليلات ولا محرّر الأسعار.
- [ ] إشعار شات والتطبيق مفتوح على تاب تاني → بينقل للرسايل في **نفس** النافذة.
- [ ] `npm run test:ui-audit` — مفيش regressions جديدة.

## تحذير
دي أكبر فيز في المستند. لو حسّيت إنها كبرت، قسّمها: 3.1 لوحدها في جلسة، وبعدين
3.2 و3.3 مع بعض. **ماتخلطش** التقسيم ده مع أي تغيير بصري — لو الفيز دي كسرت حاجة،
لازم يبقى واضح إن السبب هو الـ routing.

## الرفع
npm run ship -- "refactor(provider): nested routes, per-tab code splitting, SW deep-link focus"
```

---

## 🟠 PHASE 4 — الحاجات اللي بتخلّيها "تطبيق" (5–6 ساعات)

```
## الهدف
التغييرين اللي بيخلّوا اللوحات تتحس كتطبيق مش كموقع في نافذة.
المرجع: DM-05, DM-07.

## المهام

### 4.1 — DM-05: الشات كـ push navigation على الموبايل
`admin/ChatTab.tsx:120` — `grid-cols-1 lg:grid-cols-[20rem_1fr]`
`components/ProviderChat.tsx:78` — `grid-cols-1 md:grid-cols-[18rem_1fr]`

تحت الـ breakpoint، ليستة المحادثات (`max-h-[32rem] overflow-y-auto`) بتترص **فوق**
التريد (`h-[26rem]`) — يعني عشان تقرا رد لازم تعدّي ليستة بتعمل scroll جوّا نفسها
عشان توصل لتريد بيعمل scroll جوّا نفسه. ده الباترن المكسور الكلاسيكي.

الحل — الاتنين عندهم `active` state أصلاً، فده فرع render مش refactor:
- تحت `lg:` (أدمن) / `md:` (مزوّد): اعرض الليستة **بس** لما مفيش محادثة مختارة.
- لما تتختار: اعرض التريد بطول الشاشة + زرار رجوع في رأسه يعمل `setActive(null)`.
- فوق الـ breakpoint: سيب العمودين زي ما هما بالظبط.
- التريد على الموبايل ياخد `h-[calc(100dvh-...)]` بدل `h-[26rem]` الثابت.

بعد Phase 3، خلّي المحادثة المختارة route param (`/admin/chat/:id`) عشان زرار
الرجوع بتاع النظام يقفل التريد — دي أول حاجة المستخدم هيجرّبها.

### 4.2 — DM-07: bottom nav للوحات
دلوقتي أي تغيير تاب على الموبايل = هامبرجر → drawer → تاب → قفل. 10 تابات لكل دور.
الزباين بياخدوا bottom bar بأربع تابات على الموقع العام؛ الناس اللي شغّالة على
المنتج طول اليوم بتاخد هامبرجر.

الحل:
- عمّم `components/BottomNav.tsx` على list من الـ items بدل ما تعمل منه نسخة تالتة.
  (خد بالك: هو دلوقتي بيقرا `useSaved` جوّاه — دي حاجة خاصة بالموقع العام، لازم
  تطلع برّه كـ prop.)
- المزوّد: نظرة عامة · الليدز · الرسايل · الإتاحة
- الأدمن: نظرة عامة · الليدز · المحادثات · التغييرات
- نفس الـ badges اللي السايدبار بيحسبها أصلاً (`newCount`, `chatBadge`, `changeBadge`).
- الست تابات الباقيين يفضلوا في الـ drawer.
- لازم تاخد `bottom-nav-safe` (موجود في `index.css`) و`<main>` ياخد `pb-14 md:pb-0`
  زي `RootLayout.tsx:139` بالظبط.

## معايير القبول
- [ ] على 390px، فتح محادثة في `/admin/chat` بيملا الشاشة وفيه زرار رجوع.
- [ ] مفيش أي scroll متداخل على 390px (assertion 0.4 بتاعة Phase 0 بتعدّي).
- [ ] على 1366px الشات لسه عمودين — مفيش تغيير.
- [ ] تبديل التاب على الموبايل بقى **نقرة واحدة** للأربع تابات الأساسية.
- [ ] الـ badges في الـ bottom nav بتطابق اللي في السايدبار.
- [ ] الـ bottom nav مش بيغطي زرار حفظ الإعدادات (تقاطع مع Phase 2).

## الرفع
npm run ship -- "feat(dashboards): mobile chat push-navigation and role-aware bottom nav"
```

---

## ⚪ PHASE 5 — اللمسات الأخيرة (4–5 ساعات)

```
## الهدف
الحاجات المتبقية: كارت الشركة، اللمس مقابل الـ hover، الرسوم البيانية، والجيستشرز.
المرجع: DM-08, DM-11, DM-14, DM-15, DM-16.

## المهام

### 5.1 — DM-08: كارت الشركة في الأدمن
`admin/tabs/CompaniesPage.tsx:113` — `flex items-center gap-4` من غير أي breakpoint،
جوّاه لوجو 56px + نص + **عمود رأسي فيه 4 أزرار بـ 44px** (تعديل/مشغول/عرض/دخول).
على 390px بيفضل ~128px للاسم والتصنيف وسطر الإحصائيات.

- الكارت: `flex-col sm:flex-row`
- ستاك الأزرار: `flex-row sm:flex-col` (تبقى صف تحت النص على الموبايل)
- سطر الإحصائيات: ضيف `flex-wrap`

### 5.2 — DM-11: قيم الأعمدة والـ tooltips على اللمس
`components/Charts.tsx:206` — قيمة كل عمود `opacity-0 group-hover:opacity-100`.
على الموبايل الرسم البياني بيبقى **شكل من غير أرقام**، ومفيش أي جيستشر يوصّلها.
- `BarChart`: اعرض القيم دايمًا تحت `md:`.
- الـ `title=` المنتشرة (تاريخ الانشغال على كروت الشركات، شرح التقييم الموثّق،
  تلميحات الإتاحة): أي `title` بيحمل معلومة مش موجودة في أي مكان تاني، حوّلها لنص
  ظاهر أو disclosure بيتنقر. الـ `title` يفضل رفاهية مكرّرة بس.

### 5.3 — DM-14: تشوّه الرسوم على العرض الضيّق
`Charts.tsx:79` و `:133` فيهم `preserveAspectRatio="none"` مع `height` ثابت و
`w-full`. الـ viewBox بيتمطّ في كل محور لوحده، فنفس الترند بيبان بسُمك خط وميل
مختلفين على 390 و1366.
- غيّرها لـ `xMidYMid meet` (أو امسح الخاصية).
- `BarChart`: 6 أسماء شهور في ~50px لكل واحد بتتقص — اعرض واحد من كل اتنين تحت `sm:`.

### 5.4 — DM-15: جيستشرز الـ drawer
`DashboardShell.tsx:47` — الـ drawer بيفتح من الهامبرجر بس وبيقفل بالـ × أو
الخلفية. `useDialogA11y` بيدّي Escape و focus trap — الاتنين للكيبورد.
- ضيف touch handlers على لوحة الـ drawer: translate مع السحب، ويتقفل بعد حد معيّن.
- `Modal.tsx` بياخد `onTouchStart`/`onTouchEnd` بالفعل (الـ lightbox بيستخدمهم) —
  الـ primitive موجود.
- **ماتحطّش** شريط سحب (drag handle) من غير سلوك سحب حقيقي — `Modal.tsx:93` مكتوب
  فيه ليه (CMP-09).

### 5.5 — DM-16: وسيلة تحديث على اللمس
مفيش pull-to-refresh ولا زرار تحديث في أي من اللوحتين. في PWA مثبّتة مفيش reload
أصلاً — مزوّد ليستته بايتة معندهوش أي طريقة يحدّثها غير إنه يقفل التطبيق.
- الحد الأدنى (وموثوق): زرار تحديث في التوب-بار — `topbarActions` slot موجود بالفعل.
- الأحسن: pull-to-refresh على تابات الليستة، ومعاه `overscroll-behavior: contain`
  عشان ميتخانقش مع جيستشر المتصفح نفسه.

## معايير القبول
- [ ] كارت الشركة على 390px: الاسم والتصنيف والإحصائيات كاملة من غير قص.
- [ ] `BarChart` بيعرض أرقامه على الموبايل من غير hover.
- [ ] الرسوم على 390 و1366 ليها نفس سُمك الخط والميل.
- [ ] الـ drawer بيتقفل بالسحب، وبيشتغل صح في RTL (السحب لليمين في العربي).
- [ ] زرار التحديث بيجيب داتا جديدة فعلاً وبيوضّح إنه شغّال.
- [ ] `npm run test:ui-audit` أخضر بالكامل على كل الـ routes بتاعة اللوحات.

## الرفع
npm run ship -- "polish(dashboards): responsive company card, touch-readable charts, drawer gestures, refresh"
```

---

## 📊 الملخّص

| الفيز | البنود | الجهد | الناتج |
|---|---|---|---|
| **0** | DM-01 | 2–3 س | التستات بتفحص اللوحات فعليًا — الباقي بقى تست أحمر |
| **1** | DM-03, 09, 10, 17, 18 | 3–4 س | المزوّد ياخد كروت الأدمن؛ مفيش قص ولا overflow |
| **2** | DM-06, DM-04 | 3–4 س | 44px في كل حتة + حواف آمنة للـ standalone |
| **3** | DM-02, 12, 13 | 5–7 س | زرار الرجوع اشتغل؛ chunks أصغر؛ الإشعارات مظبوطة |
| **4** | DM-05, DM-07 | 5–6 س | الشات والتنقل بقوا بشكل تطبيق |
| **5** | DM-08, 11, 14, 15, 16 | 4–5 س | لمسات أخيرة وجيستشرز |

**الإجمالي: ~3–4 أيام شغل مركّز.**

**أقل حاجة تستحق الوقف عندها:** الفيزات 0–2 (يوم ونص). بتقفل كل بند 🟠 حله مقاسات
أو إعادة استخدام، وبتطلّع لوحة المزوّد من 4/10 لـ ~6.5/10. الفيزات 3–5 هي اللي
بتخلّيها تتحس كتطبيق فعلاً — لازمة لو ماشي في مسار الـ Capacitor، ممكن تتأجّل لو لأ.

**ترتيب الاعتماديات:**
```
0 ──► 1 ──► 2 ──► 5
      │           ▲
      └──► 3 ──► 4
```
Phase 3 لازم تيجي قبل 4 (المحادثة كـ route param، والـ deep links).
Phase 2 لازم تيجي قبل 4 (الـ bottom nav محتاج حواف آمنة مظبوطة الأول).
Phase 5 مستقلة — ممكن تتعمل في أي وقت بعد Phase 1.
